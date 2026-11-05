import pool from "@/db/client";
import { GOLD_COSTS, type LlmOperation } from "./quota-costs";

export { GOLD_COSTS };
export type { LlmOperation };

/**
 * Mapea la operación lógica a su valor en usage_logs.operation. Hay tres
 * sub-tipos lógicos ("ingest_short", "ingest_long", "ingest_batch") que
 * en BD se almacenan como "ingest" o "ingest_batch" (los valores válidos
 * del CHECK constraint).
 */
export function operationToDbValue(op: LlmOperation): string {
  if (op === "ingest_short" || op === "ingest_long") return "ingest";
  return op;
}

/**
 * Tope mensual por usuario. Default 300 monedas. Override con la env var
 * LLM_QUOTA_MONTHLY_GOLD_PER_USER.
 */
function readMonthlyCap(): number {
  const raw = process.env.LLM_QUOTA_MONTHLY_GOLD_PER_USER;
  if (!raw) return 300;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) return 300;
  return parsed;
}

export const MONTHLY_GOLD_CAP = readMonthlyCap();

export class QuotaExceededError extends Error {
  constructor(
    public readonly used: number,
    public readonly cap: number,
    public readonly cost: number,
    public readonly timezone: string,
    public readonly resetAt: Date,
  ) {
    super(
      `Quota exceeded: ${used} + ${cost} > ${cap}`,
    );
    this.name = "QuotaExceededError";
  }
}

/**
 * Suma de gold_cost gastado este mes por el usuario, junto con la TZ del
 * usuario y la fecha del próximo reset. El "mes" se calcula en la zona
 * del propio usuario (users.timezone), de modo que el reset es a las
 * 00:00 hora local del día 1 de cada mes. Postgres aplica DST
 * automáticamente.
 *
 * Cuando hay un carry de cambio de TZ activo (tz_carry_resets_at en el
 * futuro), `used` incluye tz_carry_used + lo gastado desde tz_carry_from
 * en lugar de la ventana estándar "este mes en TZ actual", y `resetAt`
 * apunta al `tz_carry_resets_at`. Esto evita que un cambio de TZ resetee
 * la cuota del mes. Ver migración 010 y ADR-035 (revisado para mensual).
 *
 * Para añadir cap diario anti-abuso en el futuro: segunda query agregando
 * por date_trunc('day') con su propio cap y check adicional.
 */
export async function getMonthlyUsage(
  userId: string,
): Promise<{ used: number; timezone: string; resetAt: Date }> {
  const { rows } = await pool.query(
    `SELECT
       u.timezone,
       CASE
         WHEN u.tz_carry_resets_at IS NOT NULL AND NOW() < u.tz_carry_resets_at THEN
           u.tz_carry_used + COALESCE(
             (SELECT SUM(gold_cost)::int
                FROM usage_logs
               WHERE user_id = u.id
                 AND created_at >= u.tz_carry_from),
             0
           )
         ELSE
           COALESCE(
             (SELECT SUM(gold_cost)::int
                FROM usage_logs
               WHERE user_id = u.id
                 AND created_at >= date_trunc('month', NOW() AT TIME ZONE u.timezone) AT TIME ZONE u.timezone),
             0
           )
       END AS used,
       CASE
         WHEN u.tz_carry_resets_at IS NOT NULL AND NOW() < u.tz_carry_resets_at THEN
           u.tz_carry_resets_at
         ELSE
           (date_trunc('month', NOW() AT TIME ZONE u.timezone) + INTERVAL '1 month') AT TIME ZONE u.timezone
       END AS reset_at
     FROM users u
     WHERE u.id = $1`,
    [userId],
  );
  if (rows.length === 0) {
    throw new Error(`Usuario no encontrado: ${userId}`);
  }
  return {
    used: rows[0].used,
    timezone: rows[0].timezone,
    resetAt: rows[0].reset_at,
  };
}

/**
 * Pre-check estricto antes de la llamada LLM: si lo gastado este mes más
 * el coste de esta operación supera el tope, lanza QuotaExceededError.
 * Las operaciones gratuitas (cost=0, p.ej. ingest_entity) no se chequean.
 *
 * El handler debería capturar el error y devolver 429 con un mensaje en
 * español. Si el error escapa, Next devolverá 500 — preferible que sea
 * el handler quien decida cómo formatear el bloqueo.
 */
export async function ensureQuota(
  userId: string,
  operation: LlmOperation,
): Promise<{ used: number; cost: number; cap: number; timezone: string; resetAt: Date }> {
  const cost = GOLD_COSTS[operation];
  const { used, timezone, resetAt } = await getMonthlyUsage(userId);
  if (cost === 0) {
    return { used, cost, cap: MONTHLY_GOLD_CAP, timezone, resetAt };
  }
  if (used + cost > MONTHLY_GOLD_CAP) {
    throw new QuotaExceededError(used, MONTHLY_GOLD_CAP, cost, timezone, resetAt);
  }
  return { used, cost, cap: MONTHLY_GOLD_CAP, timezone, resetAt };
}

/**
 * Mensaje 429 cuando corta el presupuesto del gateway (Otari) en vez de
 * nuestras monedas. Es una red de seguridad: con la cuota bien calibrada
 * no debería verse. No se cobran monedas (el log solo se escribe al
 * terminar bien).
 */
export function buildGatewayBudgetResponse() {
  return {
    error:
      "Se ha alcanzado el límite de gasto de IA. No se te han descontado monedas; " +
      "inténtalo más tarde o avisa al administrador de la campaña.",
    gateway_budget: true,
  };
}

/**
 * Mensaje 429 estándar para devolver al frontend. Centralizado para
 * coherencia entre rutas.
 */
export function buildQuotaExceededResponse(err: QuotaExceededError) {
  const resetLabel = new Intl.DateTimeFormat("es-ES", {
    timeZone: err.timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(err.resetAt);
  return {
    error:
      `Has agotado tus monedas de oro del mes (${err.used}/${err.cap}). ` +
      `Esta operación cuesta ${err.cost}. ` +
      `Las monedas se reponen el ${resetLabel} (${err.timezone}).`,
    used: err.used,
    cap: err.cap,
    cost: err.cost,
    timezone: err.timezone,
    reset_at: err.resetAt.toISOString(),
  };
}
