import { getProviderStatus, MODEL_IDS } from "@/lib/llm-provider";
import ProviderToggle from "./ProviderToggle";

export const dynamic = "force-dynamic";

const TIER_LABELS: Record<keyof typeof MODEL_IDS, string> = {
  haiku: "Consultas e ingestas cortas",
  sonnet: "Ingestas largas",
  summary: "Selector de docs y resúmenes",
};

export default async function AdminModelsPage() {
  const status = await getProviderStatus();
  const tiers = Object.keys(MODEL_IDS) as (keyof typeof MODEL_IDS)[];

  return (
    <div>
      <h1 className="text-2xl font-cinzel text-amber-200 mb-2">Modelos LLM</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Proveedor que usan todas las llamadas de la app. El cambio es inmediato,
        sin redeploy.
      </p>

      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wide text-zinc-400 mb-3">Proveedor activo</h2>
        <ProviderToggle current={status.provider} />
        <p className="mt-3 text-xs text-zinc-500">
          {status.source === "admin"
            ? `Elegido en este panel${status.updatedBy ? ` por ${status.updatedBy}` : ""}${
                status.updatedAt ? ` el ${status.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""
              }.`
            : "Sin elección en el panel: se usa la variable LLM_DEFAULT_PROVIDER de Coolify."}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Las ingestas por lotes (Batch API) solo existen con Anthropic; con OpenAI
          las notas largas se procesan en línea.
        </p>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-zinc-400 mb-3">Modelo por tier</h2>
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Tier</th>
                <th className="text-left px-4 py-2">Anthropic</th>
                <th className="text-left px-4 py-2">OpenAI</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier} className="border-t border-zinc-800">
                  <td className="px-4 py-2">
                    <div className="text-zinc-200">{tier}</div>
                    <div className="text-xs text-zinc-500">{TIER_LABELS[tier]}</div>
                  </td>
                  {(["anthropic", "openai"] as const).map((p) => (
                    <td
                      key={p}
                      className={`px-4 py-2 font-mono ${
                        p === status.provider ? "text-amber-200" : "text-zinc-500"
                      }`}
                    >
                      {MODEL_IDS[tier][p]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Los IDs se cambian con las variables LLM_MODEL_* en Coolify (ver .env.example).
        </p>
      </section>
    </div>
  );
}
