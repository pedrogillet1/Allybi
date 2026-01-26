/**
 * Document Compare Service
 * Compares documents for differences
 */

export interface CompareResult {
  similarity: number;
  additions: string[];
  deletions: string[];
  changes: string[];
}

export class DocumentCompareService {
  compare(doc1: string, doc2: string): CompareResult {
    // Simple comparison logic
    const words1 = new Set(doc1.split(/\s+/));
    const words2 = new Set(doc2.split(/\s+/));
    
    const additions = [...words2].filter(w => !words1.has(w));
    const deletions = [...words1].filter(w => !words2.has(w));
    
    const intersection = [...words1].filter(w => words2.has(w));
    const union = new Set([...words1, ...words2]);
    const similarity = intersection.length / union.size;
    
    return { similarity, additions, deletions, changes: [] };
  }
}

export const documentCompare = new DocumentCompareService();
