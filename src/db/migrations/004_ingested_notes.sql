-- Detección de duplicados por hash de contenido normalizado.
-- Evita re-procesar la misma nota (mismo texto subido dos veces) con el LLM.
CREATE TABLE IF NOT EXISTS ingested_notes (
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  content_hash  CHAR(64) NOT NULL,
  upload_id     UUID REFERENCES uploads(id) ON DELETE SET NULL,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, content_hash)
);

-- DOWN:
-- DROP TABLE ingested_notes;
