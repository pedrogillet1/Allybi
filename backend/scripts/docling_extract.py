#!/usr/bin/env python3
"""
Docling Document Extractor for Koda
Converts documents to structured JSON, Markdown, and semantic chunks.
"""
import argparse
import json
import os
import sys
import hashlib
from typing import Any, Dict, List

from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker


def stable_id(s: str) -> str:
    """Generate a stable chunk ID from content hash."""
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:16]


def safe_serialize(obj: Any) -> Any:
    """Safely serialize objects that may not be JSON-serializable."""
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, dict):
        return {k: safe_serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [safe_serialize(v) for v in obj]
    # For other objects, try to get a dict representation or convert to string
    try:
        if hasattr(obj, '__dict__'):
            return safe_serialize(obj.__dict__)
        return str(obj)
    except Exception:
        return str(obj)


def main():
    ap = argparse.ArgumentParser(description="Extract document content using Docling")
    ap.add_argument("--input", required=True, help="Input file path (PDF, DOCX, PPTX, etc.)")
    ap.add_argument("--outdir", required=True, help="Output directory for extracted files")
    args = ap.parse_args()

    inp = os.path.abspath(args.input)
    outdir = os.path.abspath(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    # Validate input file exists
    if not os.path.exists(inp):
        raise FileNotFoundError(f"Input file not found: {inp}")

    # Initialize converter
    converter = DocumentConverter()

    # Convert document
    result = converter.convert(inp)
    doc = result.document

    # Export to JSON (structured representation)
    doc_dict = doc.export_to_dict()
    doc_json = safe_serialize(doc_dict)

    # Export to Markdown (readable text)
    doc_md = doc.export_to_markdown()

    # Write JSON output
    json_path = os.path.join(outdir, "docling.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(doc_json, f, ensure_ascii=False, indent=2)

    # Write Markdown output
    md_path = os.path.join(outdir, "docling.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(doc_md)

    # Chunk using HybridChunker (tokenizer-aware, preserves structure)
    chunker = HybridChunker()
    chunks_out: List[Dict[str, Any]] = []

    for ch in chunker.chunk(doc):
        # Get contextualized text (includes heading/section context for better embeddings)
        text = chunker.contextualize(ch)

        if not text or not text.strip():
            continue

        # Extract metadata from chunk
        meta: Dict[str, Any] = {}
        try:
            # Try to get meta from chunk object
            if hasattr(ch, 'meta') and ch.meta:
                meta = safe_serialize(ch.meta)

            # Try to get heading/section info
            if hasattr(ch, 'headings') and ch.headings:
                meta['headings'] = [str(h) for h in ch.headings]

            # Try to get page info
            if hasattr(ch, 'page') and ch.page is not None:
                meta['page'] = ch.page
            elif hasattr(ch, 'page_no') and ch.page_no is not None:
                meta['page'] = ch.page_no

        except Exception:
            meta = {}

        chunks_out.append({
            "chunk_id": stable_id(text[:5000]),
            "text": text,
            "char_count": len(text),
            "meta": meta,
        })

    # Write chunks output
    chunks_path = os.path.join(outdir, "chunks.json")
    with open(chunks_path, "w", encoding="utf-8") as f:
        json.dump(chunks_out, f, ensure_ascii=False, indent=2)

    # Machine-readable stdout for Node bridge
    output = {
        "ok": True,
        "docling_json": json_path,
        "docling_md": md_path,
        "chunks_json": chunks_path,
        "chunk_count": len(chunks_out),
        "total_chars": sum(c["char_count"] for c in chunks_out),
    }
    print(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        error_output = {
            "ok": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }
        print(json.dumps(error_output))
        sys.exit(1)
