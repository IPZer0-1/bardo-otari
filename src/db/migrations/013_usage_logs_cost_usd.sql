-- Coste real en USD de cada operación, tal como lo reporta el gateway
-- (Otari, `usage.cost_usd`). Suma todas las llamadas de la operación:
-- router, resumen de historial y llamada principal. NULL cuando el
-- provider no informa del coste (Anthropic u OpenAI directos, batch).
--
-- Sirve para calibrar las monedas de oro frente al gasto real:
--   SELECT operation, AVG(cost_usd / NULLIF(gold_cost, 0)) AS usd_por_moneda
--     FROM usage_logs WHERE cost_usd IS NOT NULL GROUP BY operation;
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(12, 6);

-- DOWN:
-- ALTER TABLE usage_logs DROP COLUMN IF EXISTS cost_usd;
