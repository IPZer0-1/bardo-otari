-- Cada usuario tiene su propia zona horaria, usada para calcular el reset
-- diario de la cuota LLM (P0.6). El default se aplica a las filas existentes
-- (registros pre-migración) y a registros futuros si el cliente no envía
-- el campo. El form de registro auto-detecta del navegador.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Madrid';

-- DOWN:
-- ALTER TABLE users DROP COLUMN IF EXISTS timezone;
