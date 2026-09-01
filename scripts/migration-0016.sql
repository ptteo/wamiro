-- Wamiro migration 0016: pgvector semantic search for knowledge articles.
-- Requires the vector extension. On RDS Postgres 15+ run once as master user
-- if it fails: CREATE EXTENSION vector;
-- Idempotent-ish: safe to re-run.

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension unavailable — semantic search disabled until installed';
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS embedding vector(1536);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'vector type missing — column not added';
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS knowledge_embedding_hnsw
    ON knowledge_articles USING hnsw (embedding vector_cosine_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'hnsw index skipped (column or extension missing)';
END $$;
