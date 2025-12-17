/**
 * Script to fix the PPTX text extraction bug
 * The old extractor was pulling ALL XML properties including coordinates/styling
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'services', 'textExtraction.service.ts');

const oldFunction = `/**
 * Extract text from parsed slide XML object
 * Recursively traverse the XML structure to find text nodes
 */
function extractTextFromSlideXml(slideXml: any, slideNumber: number): string {
  let text = '';

  // Recursive function to extract text from XML nodes
  function extractText(node: any): string {
    let result = '';

    if (!node) return result;

    // If node is a string, return it
    if (typeof node === 'string') {
      return node + ' ';
    }

    // If node is an array, process each element
    if (Array.isArray(node)) {
      for (const item of node) {
        result += extractText(item);
      }
      return result;
    }

    // If node is an object, process its properties
    if (typeof node === 'object') {
      // Look for text content in 'a:t' tags (text runs)
      if (node['a:t']) {
        result += extractText(node['a:t']) + ' ';
      }

      // Look for text in 'a:p' tags (paragraphs)
      if (node['a:p']) {
        result += extractText(node['a:p']) + '\\n';
      }

      // Look for text in 'a:r' tags (text runs)
      if (node['a:r']) {
        result += extractText(node['a:r']);
      }

      // Recursively process all other properties
      for (const key in node) {
        if (key !== 'a:t' && key !== 'a:p' && key !== 'a:r') {
          result += extractText(node[key]);
        }
      }
    }

    return result;
  }

  text = extractText(slideXml);

  // Clean up whitespace
  text = text
    .replace(/\\s+/g, ' ')
    .replace(/\\n\\s+\\n/g, '\\n\\n')
    .trim();

  return text;
}`;

const newFunction = `/**
 * Extract text from parsed slide XML object
 * Only extracts actual text content from a:t tags within text body containers
 * FIX: Previous version extracted ALL XML properties including coordinates/styling
 */
function extractTextFromSlideXml(slideXml: any, slideNumber: number): string {
  const textParts: string[] = [];

  /**
   * Recursively find text body containers (p:txBody) and extract a:t text only
   * This avoids extracting numeric coordinates, font names, and other XML attributes
   */
  function findTextBodies(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const item of node) {
        findTextBodies(item);
      }
      return;
    }

    // Found a text body container - extract text from it
    if (node['p:txBody']) {
      const bodyText = extractTextFromBody(node['p:txBody']);
      if (bodyText.trim()) {
        textParts.push(bodyText.trim());
      }
    }

    // Also check for standalone paragraphs at shape level
    if (node['a:p'] && !node['p:txBody']) {
      const paragraphText = extractTextFromParagraphs(node['a:p']);
      if (paragraphText.trim()) {
        textParts.push(paragraphText.trim());
      }
    }

    // Recurse into known container elements only (not all properties)
    const containerKeys = [
      'p:cSld', 'p:spTree', 'p:sp', 'p:grpSp', 'p:graphicFrame',
      'a:graphic', 'a:graphicData', 'a:tbl', 'a:tr', 'a:tc'
    ];
    for (const key of containerKeys) {
      if (node[key]) {
        findTextBodies(node[key]);
      }
    }
  }

  /**
   * Extract text from a text body (p:txBody)
   */
  function extractTextFromBody(txBody: any): string {
    if (!txBody) return '';
    const paragraphs = txBody['a:p'];
    return extractTextFromParagraphs(paragraphs);
  }

  /**
   * Extract text from paragraph array (a:p)
   */
  function extractTextFromParagraphs(paragraphs: any): string {
    if (!paragraphs) return '';

    const paragraphArray = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
    const lines: string[] = [];

    for (const p of paragraphArray) {
      const lineText = extractTextFromRuns(p['a:r']);
      if (lineText.trim()) {
        lines.push(lineText.trim());
      }
    }

    return lines.join('\\n');
  }

  /**
   * Extract text from text runs (a:r) - these contain the actual a:t text
   */
  function extractTextFromRuns(runs: any): string {
    if (!runs) return '';

    const runArray = Array.isArray(runs) ? runs : [runs];
    const textFragments: string[] = [];

    for (const run of runArray) {
      if (run && run['a:t']) {
        // a:t can be a string or array of strings
        const textContent = run['a:t'];
        if (Array.isArray(textContent)) {
          for (const t of textContent) {
            if (typeof t === 'string') {
              textFragments.push(t);
            } else if (t && typeof t === 'object' && t['_']) {
              textFragments.push(t['_']);
            }
          }
        } else if (typeof textContent === 'string') {
          textFragments.push(textContent);
        } else if (textContent && typeof textContent === 'object' && textContent['_']) {
          textFragments.push(textContent['_']);
        }
      }
    }

    return textFragments.join('');
  }

  // Start extraction from root
  findTextBodies(slideXml);

  // Join all text parts with line breaks
  const text = textParts.join('\\n\\n');

  // Clean up whitespace
  return text
    .replace(/[ \\t]+/g, ' ')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();
}`;

// Read file
let content = fs.readFileSync(filePath, 'utf-8');

// Check if fix already applied
if (content.includes('findTextBodies')) {
  console.log('✅ Fix already applied!');
  process.exit(0);
}

// Check if old function exists
if (!content.includes('Recursively process all other properties')) {
  console.error('❌ Could not find the old function to replace');
  process.exit(1);
}

// Replace
content = content.replace(oldFunction, newFunction);

// Write back
fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ PPTX extractor fixed successfully!');
