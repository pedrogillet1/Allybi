/**
 * Document Scope Service
 * Manages document scoping for queries
 */

export interface ScopeResult {
  documentIds: string[];
  confidence: number;
  reason: string;
}

export class DocumentScopeService {
  async determineScope(query: string, userId: string): Promise<ScopeResult> {
    return {
      documentIds: [],
      confidence: 1.0,
      reason: 'all_documents',
    };
  }
}

export const documentScope = new DocumentScopeService();
