import pool from "@/db/client";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  is_admin: boolean;
  created_at: string;
  last_activity_at: string | null;
  queries_total: number;
  gold_month: number;
  conversations_count: number;
  uploads_done: number;
  uploads_failed: number;
}

// Una sola query con subselects correlacionadas — eficiente con índices
// existentes (idx_uploads_campaign, PK de usage_logs por user_id implícito).
// Para >100 users convendría reescribir con LEFT JOIN LATERAL agregados;
// con el piloto actual (4 users, techo previsible <50) no compensa.
//
// gold_month usa la TZ del propio user para alinearse con la ventana de
// cuota mensual real (ADR-036). No considera el carry-over de TZ
// (tz_carry_*): el panel admin muestra "monedas consumidas en el mes
// calendario", no "monedas que cuentan para enforcement". Suficiente para
// detectar quién quema cuota; el enforcement vive en quota.ts.
export async function getAdminUserActivity(): Promise<AdminUserRow[]> {
  const { rows } = await pool.query<{
    id: string;
    email: string;
    name: string | null;
    timezone: string;
    is_admin: boolean;
    created_at: string;
    last_activity_at: string | null;
    queries_total: string;
    gold_month: string;
    conversations_count: string;
    uploads_done: string;
    uploads_failed: string;
  }>(`
    SELECT
      u.id,
      u.email,
      u.name,
      u.timezone,
      u.is_admin,
      u.created_at,
      (SELECT MAX(created_at) FROM usage_logs WHERE user_id = u.id) AS last_activity_at,
      COALESCE((
        SELECT COUNT(*) FROM usage_logs
        WHERE user_id = u.id AND operation = 'query'
      ), 0)::text AS queries_total,
      COALESCE((
        SELECT SUM(gold_cost) FROM usage_logs
        WHERE user_id = u.id
          AND created_at >= date_trunc('month', NOW() AT TIME ZONE u.timezone) AT TIME ZONE u.timezone
      ), 0)::text AS gold_month,
      (SELECT COUNT(*) FROM conversations WHERE user_id = u.id)::text AS conversations_count,
      (SELECT COUNT(*) FROM uploads WHERE user_id = u.id AND status = 'done')::text AS uploads_done,
      (SELECT COUNT(*) FROM uploads WHERE user_id = u.id AND status = 'failed')::text AS uploads_failed
    FROM users u
    ORDER BY u.created_at DESC
  `);

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    timezone: r.timezone,
    is_admin: r.is_admin,
    created_at: r.created_at,
    last_activity_at: r.last_activity_at,
    queries_total: Number(r.queries_total),
    gold_month: Number(r.gold_month),
    conversations_count: Number(r.conversations_count),
    uploads_done: Number(r.uploads_done),
    uploads_failed: Number(r.uploads_failed),
  }));
}
