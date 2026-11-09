-- Ajustes globales de la app editables desde el panel admin (sesión 2026-10-31).
--
-- Primer uso: `llm_provider` (anthropic | openai), que sobrescribe la env var
-- LLM_DEFAULT_PROVIDER sin necesidad de redeploy. Si la fila no existe, la app
-- cae al env var — por eso la migración no inserta nada.

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

-- DOWN:
-- DROP TABLE IF EXISTS app_settings;
