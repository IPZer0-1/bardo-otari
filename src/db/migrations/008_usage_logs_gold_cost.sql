-- Cuota diaria por usuario expresada en "monedas de oro" (P0.6).
-- Cada operación LLM persiste su coste en monedas en esta columna,
-- congelando el precio del momento (cambios futuros de tarifa no
-- afectan retroactivamente al consumo ya registrado).
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS gold_cost INTEGER NOT NULL DEFAULT 0;

-- Índice optimizado para la query de cuota:
--   SELECT SUM(gold_cost) FROM usage_logs
--   WHERE user_id = $1 AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');
-- Ya existe idx_usage_logs_user_month sobre (user_id, created_at), que
-- también sirve para el rango diario; no añadimos uno nuevo.

-- DOWN:
-- ALTER TABLE usage_logs DROP COLUMN IF EXISTS gold_cost;
