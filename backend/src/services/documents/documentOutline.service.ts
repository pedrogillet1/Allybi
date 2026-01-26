/**
 * Document Outline Service
 * Extracts document structure and outlines
 */

export interface OutlineItem {
  level: number;
  title: string;
  pageNumber?: number;
}

export class DocumentOutlineService {
  extract(content: string): OutlineItem[] {
    const items: OutlineItem[] = [];
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    
    while ((match = headingRegex.exec(content)) !== null) {
      items.push({
        level: match[1].length,
        title: match[2].trim(),
      });
    }
    
    return items;
  }
}

export const documentOutline = new DocumentOutlineService();
