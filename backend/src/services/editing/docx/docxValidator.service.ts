import AdmZip from "adm-zip";

export interface DocxValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates structural integrity of a DOCX file after edits.
 * Checks XML well-formedness, required parts, and relationship integrity.
 */
export function validateDocxStructure(buffer: Buffer): DocxValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (e: any) {
    return {
      valid: false,
      errors: [`Invalid ZIP archive: ${e.message}`],
      warnings,
    };
  }

  // 1. Required parts exist
  const requiredParts = ["word/document.xml", "[Content_Types].xml"];
  for (const part of requiredParts) {
    if (!zip.getEntry(part)) {
      errors.push(`Missing required part: ${part}`);
    }
  }

  // 2. XML well-formedness for all XML parts
  const xmlEntries = zip
    .getEntries()
    .filter((e) => e.entryName.endsWith(".xml"));
  for (const entry of xmlEntries) {
    try {
      const content = entry.getData().toString("utf8");
      // Simple well-formedness check: must start with < and not be empty
      const trimmed = content.trim();
      if (!trimmed) {
        warnings.push(`Empty XML file: ${entry.entryName}`);
        continue;
      }
      if (!trimmed.startsWith("<")) {
        errors.push(
          `Malformed XML in ${entry.entryName}: does not start with <`,
        );
        continue;
      }
      // Check for common XML issues: unclosed tags
      // Count opening vs self-closing vs closing tags (rough heuristic)
      const openTags = (trimmed.match(/<[a-zA-Z][^/]*?[^/]>/g) || []).length;
      const closeTags = (trimmed.match(/<\/[^>]+>/g) || []).length;
      const selfClosing = (trimmed.match(/<[^>]+\/>/g) || []).length;
      // Very rough check — XML should have roughly balanced tags
      // This isn't perfect but catches gross corruption
      if (openTags > 0 && closeTags === 0 && selfClosing === 0) {
        errors.push(
          `Malformed XML in ${entry.entryName}: no closing tags found`,
        );
      }
    } catch (e: any) {
      errors.push(`Cannot read ${entry.entryName}: ${e.message}`);
    }
  }

  // 3. Relationship integrity
  const relsEntry = zip.getEntry("word/_rels/document.xml.rels");
  if (relsEntry) {
    try {
      const relsContent = relsEntry.getData().toString("utf8");
      // Extract Target attributes from Relationship elements
      const targetMatches = relsContent.matchAll(/Target="([^"]+)"/g);
      for (const match of targetMatches) {
        const target = match[1];
        // Skip external targets (http/https URLs)
        if (target.startsWith("http://") || target.startsWith("https://"))
          continue;
        // Resolve relative path from word/ directory
        const resolvedPath = target.startsWith("/")
          ? target.slice(1)
          : `word/${target}`;
        if (!zip.getEntry(resolvedPath)) {
          warnings.push(`Dangling relationship target: ${target}`);
        }
      }
    } catch (e: any) {
      warnings.push(`Cannot parse relationships: ${e.message}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
