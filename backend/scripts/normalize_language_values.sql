-- Migration: Normalize Document.language to ISO codes
-- Converts spelled-out language names to ISO 639-1 codes
-- This ensures retrieval filters using LanguageCode ('en' | 'pt' | 'es') work correctly

-- Step 1: Normalize Document.language values
UPDATE documents
SET language = CASE
  WHEN LOWER(language) IN ('english', 'en', 'eng') THEN 'en'
  WHEN LOWER(language) IN ('portuguese', 'pt', 'por', 'português') THEN 'pt'
  WHEN LOWER(language) IN ('spanish', 'es', 'spa', 'español') THEN 'es'
  ELSE 'en'  -- Default unknown languages to 'en'
END
WHERE language NOT IN ('en', 'pt', 'es');

-- Step 2: Normalize DocumentMetadata.language values (if any)
UPDATE document_metadata
SET language = CASE
  WHEN LOWER(language) IN ('english', 'en', 'eng') THEN 'en'
  WHEN LOWER(language) IN ('portuguese', 'pt', 'por', 'português') THEN 'pt'
  WHEN LOWER(language) IN ('spanish', 'es', 'spa', 'español') THEN 'es'
  ELSE 'en'  -- Default unknown languages to 'en'
END
WHERE language IS NOT NULL AND language NOT IN ('en', 'pt', 'es');

-- Step 3: Normalize ConversationState.language values
UPDATE conversation_states
SET language = CASE
  WHEN LOWER(language) IN ('english', 'en', 'eng') THEN 'en'
  WHEN LOWER(language) IN ('portuguese', 'pt', 'por', 'português') THEN 'pt'
  WHEN LOWER(language) IN ('spanish', 'es', 'spa', 'español') THEN 'es'
  ELSE 'en'  -- Default unknown languages to 'en'
END
WHERE language NOT IN ('en', 'pt', 'es');

-- Step 4: Update tsvector trigger function to handle ISO codes
-- Maps ISO codes to PostgreSQL regconfig names for full-text search
CREATE OR REPLACE FUNCTION document_embeddings_content_tsv_trigger()
RETURNS trigger AS $$
DECLARE
  doc_language VARCHAR(20);
  pg_regconfig VARCHAR(20);
BEGIN
  SELECT language INTO doc_language
  FROM documents
  WHERE id = NEW."documentId";

  -- Map ISO codes to PostgreSQL regconfig names
  pg_regconfig := CASE
    WHEN doc_language IN ('en', 'english', 'eng') THEN 'english'
    WHEN doc_language IN ('pt', 'portuguese', 'por') THEN 'portuguese'
    WHEN doc_language IN ('es', 'spanish', 'spa') THEN 'spanish'
    ELSE 'english'  -- Default to English
  END;

  NEW.content_tsv := to_tsvector(pg_regconfig::regconfig, NEW.content);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Step 5: Regenerate tsvectors for existing embeddings with updated language mapping
UPDATE document_embeddings de
SET content_tsv = to_tsvector(
  (CASE
    WHEN d.language IN ('en', 'english', 'eng') THEN 'english'
    WHEN d.language IN ('pt', 'portuguese', 'por') THEN 'portuguese'
    WHEN d.language IN ('es', 'spanish', 'spa') THEN 'spanish'
    ELSE 'english'
  END)::regconfig,
  de.content
)
FROM documents d
WHERE de."documentId" = d.id;

-- Verify results
SELECT 'documents' as table_name, language, COUNT(*) as count
FROM documents
GROUP BY language
UNION ALL
SELECT 'document_metadata' as table_name, language, COUNT(*) as count
FROM document_metadata
WHERE language IS NOT NULL
GROUP BY language
UNION ALL
SELECT 'conversation_states' as table_name, language, COUNT(*) as count
FROM conversation_states
GROUP BY language
ORDER BY table_name, count DESC;
