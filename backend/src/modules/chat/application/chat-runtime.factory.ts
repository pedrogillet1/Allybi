import prisma from "../../../config/database";
import { getBankLoaderInstance } from "../../../services/core/banks/bankLoader.service";
import { ConversationMemoryService } from "../../../services/memory/conversationMemory.service";
import { createUserScopedRetrievalRuntime } from "../../../services/core/retrieval/v2/RetrievalRuntimeBootstrap.service";
import { TraceWriterService } from "../../../services/telemetry/traceWriter.service";
import type { EncryptedChatRepo } from "../../../modules/chat/infrastructure/encryptedChatRepo.service";
import type { EncryptedChatContextService } from "../../../modules/chat/infrastructure/encryptedChatContext.service";
import type { ChatEngine } from "../domain/chat.contracts";
import { ChatRuntimeOrchestrator } from "../runtime/ChatRuntimeOrchestrator";
import { ChatTurnExecutor } from "../runtime/ChatTurnExecutor";
import { ConversationQueryStore } from "../runtime/ConversationQueryStore";
import { ConversationMutationStore } from "../runtime/ConversationMutationStore";
import { ChatMemoryContextService } from "../runtime/ChatMemoryContextService";
import { ChatComposeService } from "../runtime/ChatComposeService";
import { ChatTraceArtifactsService } from "../runtime/ChatTraceArtifactsService";
import { ChatTurnIdentityService } from "../runtime/ChatTurnIdentityService";
import { ChatTurnPersistenceService } from "../runtime/ChatTurnPersistenceService";
import { ScopeService } from "../runtime/ScopeService";
import { resolveScopeRuntimeConfig } from "../runtime/scopeRuntimeConfig";
import {
  ScopeMentionResolver,
  resolveScopeRuntimeMentionConfig,
} from "../runtime/ScopeMentionResolver";
import { TurnFinalizationService } from "../runtime/TurnFinalizationService";
import { RuntimePolicyGate } from "../runtime/RuntimePolicyGate";
import { TurnRetrievalService } from "../runtime/TurnRetrievalService";
import { SourceAssemblyService } from "../runtime/SourceAssemblyService";
import {
  resolveChatRuntimeEnvironment,
  resolveComposeRuntimeConfig,
  resolveMemoryRuntimeConfig,
  resolveRetrievalRuntimeConfig,
} from "../config/chatRuntimeConfig";

export type ChatRuntimeFactoryOptions = {
  encryptedRepo?: EncryptedChatRepo;
  encryptedContext?: EncryptedChatContextService;
  conversationMemory?: ConversationMemoryService;
};

export function createChatRuntimeFacade(
  engine: ChatEngine,
  opts: ChatRuntimeFactoryOptions = {},
): {
  executor: ChatTurnExecutor;
  orchestrator: ChatRuntimeOrchestrator;
} {
  const conversationMemory =
    opts.conversationMemory || new ConversationMemoryService();
  const retrievalRuntime = createUserScopedRetrievalRuntime();
  const conversationQueryStore = new ConversationQueryStore(opts.encryptedRepo);
  const conversationMutationStore = new ConversationMutationStore(
    conversationQueryStore,
    opts.encryptedRepo,
  );
  const memoryConfig = resolveMemoryRuntimeConfig();
  const memoryContextService = new ChatMemoryContextService(
    conversationMemory,
    opts.encryptedContext,
    memoryConfig,
  );
  const retrievalService = new TurnRetrievalService(
    engine,
    retrievalRuntime,
    memoryContextService,
    resolveRetrievalRuntimeConfig(),
  );
  const sourceAssemblyService = new SourceAssemblyService();
  const composeService = new ChatComposeService(
    memoryContextService,
    resolveComposeRuntimeConfig(),
  );
  const traceArtifactsService = new ChatTraceArtifactsService(
    new TraceWriterService(prisma),
    {
      environment: resolveChatRuntimeEnvironment(),
    },
  );
  const turnIdentityService = new ChatTurnIdentityService(
    conversationMutationStore,
    memoryContextService,
  );
  const turnPersistenceService = new ChatTurnPersistenceService(
    conversationQueryStore,
    conversationMutationStore,
    memoryContextService,
    traceArtifactsService,
  );
  const executor = new ChatTurnExecutor({
    engine,
    memoryContextService,
    retrievalService,
    sourceAssemblyService,
    composeService,
    traceArtifactsService,
    turnIdentityService,
    turnPersistenceService,
  });

  const bankLoader = getBankLoaderInstance();
  const scopeRuntimeConfig = resolveScopeRuntimeConfig(bankLoader);
  const orchestrator = new ChatRuntimeOrchestrator(executor, {
    scopeService: new ScopeService({
      prismaClient: prisma,
      runtimeConfig: scopeRuntimeConfig,
    }),
    scopeMentionResolver: new ScopeMentionResolver({
      prismaClient: prisma,
      config: resolveScopeRuntimeMentionConfig(bankLoader),
    }),
    finalizationService: new TurnFinalizationService(),
    runtimePolicyGate: new RuntimePolicyGate(),
  });

  return { executor, orchestrator };
}
