-- Puntuación del guardrail de Otari (prompt injection, modo monitor) sobre
-- la ingesta de cada nota: la más alta entre router y llamada principal.
-- NULL si no se evaluó (sin Otari, sin guardrail o ingesta sin LLM).
-- Las notas con puntuación >= OTARI_GUARDRAIL_ALERT_SCORE (0.9 por defecto)
-- aparecen en Ajustes → "Notas a revisar" para creador y máster.
ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS guardrail_score NUMERIC(4, 3);

-- DOWN:
-- ALTER TABLE uploads DROP COLUMN IF EXISTS guardrail_score;
