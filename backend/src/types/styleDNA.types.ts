export interface StyleDNAProfile {
  version: "1.0";
  documentId: string;
  presentationId: string;

  primaryPalette: string[];
  accentPalette: string[];

  titleFontFamily: string;
  bodyFontFamily: string;
  titleFontSizePt: number;
  bodyFontSizePt: number;

  dominantLayouts: Array<{ layout: string; count: number }>;

  preferredImageStyle: "photo" | "illustration" | "mixed";
  titleTone: "formal" | "neutral" | "bold";
  visualDensity: "low" | "medium" | "high";
  spacingPreference: "airy" | "balanced" | "compact";

  confidence: number;
  extractedAt: string;
  fingerprint: string;
}

export interface ExtractStyleDNAInput {
  userId: string;
  documentId: string;
  presentationId: string;
  forceRefresh?: boolean;
}

export interface StyleDNARepository {
  getByDocument(
    userId: string,
    documentId: string,
  ): Promise<StyleDNAProfile | null>;
  save(userId: string, documentId: string, dna: StyleDNAProfile): Promise<void>;
}
