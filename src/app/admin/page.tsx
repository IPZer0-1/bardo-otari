import { getAdminMetrics } from "@/lib/admin-metrics";

export const dynamic = "force-dynamic";

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-2 text-3xl font-cinzel text-amber-200">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export default async function AdminMetricsPage() {
  const m = await getAdminMetrics();

  const successRate =
    m.uploads_success_rate_30d === null
      ? "—"
      : `${(m.uploads_success_rate_30d * 100).toFixed(1)}%`;

  return (
    <div>
      <h1 className="text-2xl font-cinzel text-amber-200 mb-2">Métricas agregadas</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Ventanas &quot;hoy&quot; y &quot;mes&quot; en UTC. Última actualización: cada
        carga de página.
      </p>

      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wide text-zinc-400 mb-3">Usuarios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card label="Usuarios totales" value={String(m.users_total)} />
          <Card
            label="Activos (7d)"
            value={String(m.users_active_7d)}
            hint="con al menos 1 acción LLM"
          />
          <Card
            label="Invite codes usados"
            value={String(m.invite_codes_used)}
          />
          <Card
            label="Invite codes disponibles"
            value={String(m.invite_codes_available)}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wide text-zinc-400 mb-3">Consumo</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card label="Queries hoy" value={String(m.queries_today)} />
          <Card label="Queries este mes" value={String(m.queries_this_month)} />
          <Card
            label="Monedas hoy"
            value={`🪙 ${m.gold_consumed_today}`}
          />
          <Card
            label="Monedas este mes"
            value={`🪙 ${m.gold_consumed_this_month}`}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wide text-zinc-400 mb-3">Ingestas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card label="Ingestas totales" value={String(m.uploads_total)} />
          <Card
            label="Ingestas fallidas (todas)"
            value={String(m.uploads_failed_total)}
          />
          <Card
            label="Éxito ingestas (30d)"
            value={successRate}
            hint="done / total en últimos 30 días"
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-zinc-400 mb-3">
          Distribución de modelos (30d)
        </h2>
        {m.model_distribution_30d.length === 0 ? (
          <p className="text-sm text-zinc-500">Sin actividad en los últimos 30 días.</p>
        ) : (
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Modelo</th>
                  <th className="text-right px-4 py-2">Llamadas</th>
                </tr>
              </thead>
              <tbody>
                {m.model_distribution_30d.map((row) => (
                  <tr key={row.model} className="border-t border-zinc-800">
                    <td className="px-4 py-2 text-zinc-200">{row.model}</td>
                    <td className="px-4 py-2 text-right text-zinc-300">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
