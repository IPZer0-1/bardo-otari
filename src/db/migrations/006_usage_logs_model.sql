-- Añadir columna `model` para auditar qué modelo respondió cada operación.
-- Nullable: las filas históricas quedan con NULL (modelo desconocido).
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS model TEXT;

-- Relajar el CHECK de `operation` para admitir las rutas nuevas
-- introducidas en la medida (c) — ingest_correction, ingest_entity —
-- que estaban fallando el INSERT y solo lo absorbía el .catch.
ALTER TABLE usage_logs DROP CONSTRAINT IF EXISTS usage_logs_operation_check;
ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_operation_check
  CHECK (operation IN ('query', 'ingest', 'ingest_batch', 'ingest_correction', 'ingest_entity'));

-- DOWN:
-- ALTER TABLE usage_logs DROP CONSTRAINT IF EXISTS usage_logs_operation_check;
-- ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_operation_check
--   CHECK (operation IN ('query', 'ingest', 'ingest_batch'));
-- ALTER TABLE usage_logs DROP COLUMN model;
