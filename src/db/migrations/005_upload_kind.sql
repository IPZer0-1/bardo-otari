-- Tipo de ingesta (medida c): permite enrutar a flujos distintos según
-- la naturaleza de la nota.
--   session     → flujo actual con Sonnet (crónica de sesión).
--   correction  → flujo con Haiku 4.5 + prompt minimalista (cambios puntuales).
--   entity      → append determinista a la tabla del doc correspondiente, sin LLM.
--   auto        → heurística que decide en runtime el flujo a aplicar.
ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS kind TEXT
  CHECK (kind IN ('session', 'correction', 'entity', 'auto'))
  DEFAULT 'auto';

-- DOWN:
-- ALTER TABLE uploads DROP COLUMN kind;
