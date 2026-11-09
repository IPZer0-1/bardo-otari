-- Caché semántico de queries.
-- Evita llamadas a Claude cuando la misma pregunta ya se respondió
-- y los docs de la campaña no han cambiado.
CREATE TABLE IF NOT EXISTS query_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  question_hash TEXT NOT NULL,
  docs_version TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, question_hash)
);

CREATE INDEX IF NOT EXISTS idx_query_cache_lookup
  ON query_cache (campaign_id, question_hash, docs_version);
