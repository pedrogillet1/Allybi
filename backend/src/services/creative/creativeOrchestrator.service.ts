import sharp from 'sharp';

import type { AssetSpec } from './assetSpec.types';
import type { AssetLibraryRecord } from './assetLibrary.service';
import { AssetLibraryService } from './assetLibrary.service';
import { AssetProvenanceService, type ProvenanceContext, type ProvenanceProofBlock } from './assetProvenance.service';
import { AssetRendererService } from './assetRenderer.service';
import { NanoBananaClientService } from './nanoBanana.client.service';
import { PromptBuilderService, type PromptBuilderInput, type SlideBlueprint } from './promptBuilder.service';
import { QualityGateService, type QualityGateResult } from './qualityGate.service';
import { StyleDNAService, type StyleDNAProfile } from './styleDNA.service';

export interface CreativeGenerationRequest {
  userId: string;
  documentId: string;
  presentationId: string;
  blueprint: SlideBlueprint;
  assets: AssetSpec[];
  language: 'en' | 'pt';
  brandName?: string;
  globalConstraints?: PromptBuilderInput['globalConstraints'];
  insertionTargets?: Array<{
    documentId: string;
    slideObjectId?: string;
    slideNumber?: number;
    blockId?: string;
    targetLabel?: string;
  }>;
}

export interface CreativeGenerationItemResult {
  assetId: string;
  stored: AssetLibraryRecord;
  quality: QualityGateResult;
  provenance: ProvenanceProofBlock;
}

export interface CreativeGenerationResult {
  styleDNA: StyleDNAProfile;
  items: CreativeGenerationItemResult[];
}

/**
 * Wires creative generation pipeline:
 * styleDNA -> promptBuilder -> nanoBanana -> renderer -> qualityGate -> provenance.
 */
export class CreativeOrchestratorService {
  constructor(
    private readonly styleDNAService: StyleDNAService = new StyleDNAService(),
    private readonly promptBuilder: PromptBuilderService = new PromptBuilderService(),
    private readonly nanoBananaClient: NanoBananaClientService = new NanoBananaClientService(),
    private readonly renderer: AssetRendererService = new AssetRendererService(),
    private readonly qualityGate: QualityGateService = new QualityGateService(),
    private readonly assetLibrary: AssetLibraryService = new AssetLibraryService(),
    private readonly provenance: AssetProvenanceService = new AssetProvenanceService(),
  ) {}

  async generateAssets(
    request: CreativeGenerationRequest,
    ctx?: ProvenanceContext,
  ): Promise<CreativeGenerationResult> {
    const styleDNA = await this.styleDNAService.extractAndStore(
      {
        userId: request.userId,
        documentId: request.documentId,
        presentationId: request.presentationId,
      },
      {
        correlationId: ctx?.correlationId,
        userId: request.userId,
        conversationId: ctx?.conversationId,
        clientMessageId: ctx?.clientMessageId,
      },
    );

    const items: CreativeGenerationItemResult[] = [];

    for (const assetSpec of request.assets) {
      const prompt = this.promptBuilder.build({
        language: request.language,
        brandName: request.brandName,
        styleDNA,
        blueprint: request.blueprint,
        assets: [assetSpec],
        globalConstraints: request.globalConstraints,
      });

      const generation = await this.nanoBananaClient.generate({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        negativePrompt: prompt.negativePrompt,
        width: assetSpec.size.width,
        height: assetSpec.size.height,
      });

      const rendered = await this.renderer.render({
        sourceBuffer: generation.imageBuffer,
        spec: assetSpec,
      });

      const colorStats = await sharp(rendered.primary.buffer).stats();
      const dominantColors = colorStats.dominant
        ? [
            `#${Math.round(colorStats.dominant.r).toString(16).padStart(2, '0')}${Math.round(colorStats.dominant.g)
              .toString(16)
              .padStart(2, '0')}${Math.round(colorStats.dominant.b).toString(16).padStart(2, '0')}`.toUpperCase(),
          ]
        : [];

      const quality = this.qualityGate.evaluate({
        spec: assetSpec,
        styleDNA,
        rendered: {
          width: rendered.primary.width,
          height: rendered.primary.height,
          dominantColors,
          detectedText: undefined,
          fileSizeBytes: rendered.primary.byteSize,
          mimeType: rendered.primary.mimeType,
        },
      });

      if (!quality.pass) {
        throw new Error(
          `Creative quality gate failed for asset ${assetSpec.id}: ${quality.issues.map((issue) => issue.code).join(', ')}`,
        );
      }

      const stored = await this.assetLibrary.store({
        userId: request.userId,
        buffer: rendered.primary.buffer,
        mimeType: rendered.primary.mimeType as 'image/png' | 'image/webp',
        width: rendered.primary.width,
        height: rendered.primary.height,
        sha256: rendered.primary.sha256,
        thumbnailBuffer: rendered.thumbnail.buffer,
        tags: [assetSpec.type, request.blueprint.slideGoal.slice(0, 32)],
        metadata: {
          blueprint: request.blueprint.slideGoal,
          promptAudit: prompt.audit,
          generationModel: generation.model,
          generationRequestId: generation.providerRequestId,
        },
      });

      const provenanceEvent = await this.provenance.logEvent(
        {
          userId: request.userId,
          assetId: stored.id,
          tool: 'nano-banana',
          prompt: `${prompt.systemPrompt}\n${prompt.userPrompt}\nNEG:${prompt.negativePrompt}`,
          params: {
            width: assetSpec.size.width,
            height: assetSpec.size.height,
            styleMode: assetSpec.styleMode,
            backgroundMode: assetSpec.backgroundMode,
            model: generation.model,
            outputMimeType: rendered.primary.mimeType,
          },
          inserted: request.insertionTargets ?? [{ documentId: request.documentId }],
          model: generation.model,
          runId: generation.providerRequestId,
        },
        ctx,
      );

      items.push({
        assetId: assetSpec.id,
        stored,
        quality,
        provenance: this.provenance.buildProof(provenanceEvent),
      });
    }

    return {
      styleDNA,
      items,
    };
  }
}

export default CreativeOrchestratorService;
