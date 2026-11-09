-- Tracking de batch jobs de ingestión (Batch API = 50% descuento).
CREATE TABLE IF NOT EXISTS batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  batch_id TEXT NOT NULL,
  custom_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  raw_text TEXT NOT NULL,
  filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_status
  ON batch_jobs (status) WHERE status = 'processing';
