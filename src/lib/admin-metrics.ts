import pool from "@/db/client";

export interface AdminMetrics {
  users_total: number;
  users_active_7d: number;
  queries_today: number;
  queries_this_month: number;
  gold_consumed_today: number;
  gold_consumed_this_month: number;
  uploads_total: number;
  uploads_failed_total: number;
  uploads_success_rate_30d: number | null; // null si no hay uploads en 30d
  model_distribution_30d: { model: string; count: number }[];
  invite_codes_used: number;
  invite_codes_available: number;
}

// Métricas "hoy" y "mes" usan UTC en esta v1 (decisión documentada en
// planes/panel_admin.md). El desfase máximo para un admin en Madrid es 2h.
// Si genera fricción, se añade selector de TZ del admin en sesión futura.
export async function getAdminMetrics(): Promise<AdminMetrics> {
  const [
    usersRes,
    activityRes,
    queriesRes,
    goldRes,
    uploadsRes,
    modelsRes,
    invitesRes,
  ] = await Promise.all([
    pool.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM users"),
    pool.query<{ active_7d: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS active_7d
       FROM usage_logs
       WHERE created_at >= NOW() - INTERVAL '7 days'`,
    ),
    pool.query<{ today: string; month: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW()))::text AS today,
         COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::text AS month
       FROM usage_logs
       WHERE operation = 'query'`,
    ),
    pool.query<{ today: string; month: string }>(
      `SELECT
         COALESCE(SUM(gold_cost) FILTER (WHERE created_at >= date_trunc('day', NOW())), 0)::text AS today,
         COALESCE(SUM(gold_cost) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0)::text AS month
       FROM usage_logs`,
    ),
    pool.query<{
      total: string;
      failed: string;
      total_30d: string;
      done_30d: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS total_30d,
         COUNT(*) FILTER (WHERE status = 'done' AND created_at >= NOW() - INTERVAL '30 days')::text AS done_30d
       FROM uploads`,
    ),
    pool.query<{ model: string | null; n: string }>(
      `SELECT model, COUNT(*)::text AS n
       FROM usage_logs
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY model
       ORDER BY n DESC`,
    ),
    pool.query<{ used: string; available: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE used_by IS NOT NULL)::text AS used,
         COUNT(*) FILTER (WHERE used_by IS NULL AND (expires_at IS NULL OR expires_at > NOW()))::text AS available
       FROM invite_codes`,
    ),
  ]);

  const total30d = Number(uploadsRes.rows[0].total_30d);
  const done30d = Number(uploadsRes.rows[0].done_30d);
  const successRate30d = total30d === 0 ? null : done30d / total30d;

  return {
    users_total: Number(usersRes.rows[0].total),
    users_active_7d: Number(activityRes.rows[0].active_7d),
    queries_today: Number(queriesRes.rows[0].today),
    queries_this_month: Number(queriesRes.rows[0].month),
    gold_consumed_today: Number(goldRes.rows[0].today),
    gold_consumed_this_month: Number(goldRes.rows[0].month),
    uploads_total: Number(uploadsRes.rows[0].total),
    uploads_failed_total: Number(uploadsRes.rows[0].failed),
    uploads_success_rate_30d: successRate30d,
    model_distribution_30d: modelsRes.rows.map((r) => ({
      model: r.model ?? "unknown",
      count: Number(r.n),
    })),
    invite_codes_used: Number(invitesRes.rows[0].used),
    invite_codes_available: Number(invitesRes.rows[0].available),
  };
}
