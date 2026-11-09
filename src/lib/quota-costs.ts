/**
 * Tarifa en "monedas de oro" por operación LLM. Módulo libre de imports
 * server-only (no usa `pg`, ni env vars de runtime, ni `process`), por lo
 * que puede consumirse desde Client Components para mostrar la tarifa al
 * usuario sin necesidad de un endpoint adicional.
 *
 * `quota.ts` (server) reexporta `GOLD_COSTS` desde aquí para mantener una
 * sola fuente de verdad. Si cambias modelos en `LLM_MODEL_*`, conviene
 * revisar esta tabla; los tickets ya emitidos no se recalculan
 * (gold_cost se persiste por fila en usage_logs).
 */

export type LlmOperation =
  | "query"
  | "ingest_correction"
  | "ingest_entity"
  | "ingest_short"
  | "ingest_long"
  | "ingest_batch";

export const GOLD_COSTS: Record<LlmOperation, number> = {
  query:             1,
  ingest_correction: 1,
  ingest_entity:     0,
  ingest_short:      2,
  ingest_long:       10,
  ingest_batch:      10,
};
