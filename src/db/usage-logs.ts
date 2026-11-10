import pool from "@/db/client";

export interface UsageLogRow {
  userId: string;
  campaignId: string;
  /** Valor de usage_logs.operation (ver operationToDbValue en quota.ts). */
  operation: string;
  tokenCount: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  model: string;
  goldCost: number;
  /** Coste real del gateway; null si el provider no lo informa. */
  costUsd?: number | null;
}

// Si la BD aún no tiene la migración 013, se deja de enviar cost_usd para
// no perder el log (y con él el cobro de monedas).
let costColumnMissing = false;

const UNDEFINED_COLUMN = "42703";

export async function insertUsageLog(row: UsageLogRow): Promise<void> {
  const base = [
    row.userId,
    row.campaignId,
    row.operation,
    row.tokenCount,
    row.cacheCreationTokens,
    row.cacheReadTokens,
    row.model,
    row.goldCost,
  ];
  if (!costColumnMissing) {
    try {
      await pool.query(
        `INSERT INTO usage_logs (user_id, campaign_id, operation, token_count, cache_creation_tokens, cache_read_tokens, model, gold_cost, cost_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [...base, row.costUsd ?? null],
      );
      return;
    } catch (err) {
      if ((err as { code?: string }).code !== UNDEFINED_COLUMN) throw err;
      costColumnMissing = true;
      console.warn("[usage_logs] falta la columna cost_usd (migración 013); se registra sin coste");
    }
  }
  await pool.query(
    `INSERT INTO usage_logs (user_id, campaign_id, operation, token_count, cache_creation_tokens, cache_read_tokens, model, gold_cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    base,
  );
}
