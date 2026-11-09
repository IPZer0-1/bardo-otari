-- Métricas de prompt caching de Anthropic.
-- cache_creation_tokens: tokens escritos en caché (coste 1.25x, primera vez).
-- cache_read_tokens: tokens leídos del caché (coste 0.1x, hits).
-- Saber el hit-ratio nos dice si el caching está compensando.
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS cache_creation_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_read_tokens INTEGER DEFAULT 0;

-- Relajar el CHECK para aceptar 'ingest_batch' (ya lo usa el endpoint batch).
ALTER TABLE usage_logs DROP CONSTRAINT IF EXISTS usage_logs_operation_check;
ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_operation_check
  CHECK (operation IN ('query', 'ingest', 'ingest_batch'));
