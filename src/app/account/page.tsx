"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { COMMON_TIMEZONES, FALLBACK_TIMEZONE } from "@/lib/timezone";
import { GOLD_COSTS } from "@/lib/quota-costs";

const TARIFA_ROWS: { label: string; detail: string; cost: number }[] = [
  { label: "Consulta al chat", detail: "Una pregunta a la campaña", cost: GOLD_COSTS.query },
  { label: "Corrección puntual", detail: "Cambio breve sobre algo ya documentado", cost: GOLD_COSTS.ingest_correction },
  { label: "Nuevo PNJ o lugar", detail: "Formulario estructurado, sin LLM", cost: GOLD_COSTS.ingest_entity },
  { label: "Nota corta de sesión", detail: "Menos de ~1000 palabras", cost: GOLD_COSTS.ingest_short },
  { label: "Nota larga / batch", detail: "1000+ palabras, modelo principal", cost: GOLD_COSTS.ingest_long },
];

type Account = {
  email: string;
  name: string | null;
  timezone: string;
};

export default function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [timezone, setTimezone] = useState<string>(FALLBACK_TIMEZONE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/account", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: Account) => {
        setAccount(data);
        setTimezone(data.timezone);
      })
      .catch(() => setError("No se pudo cargar tu cuenta"));
  }, []);

  const showCurrentExtra =
    !!account &&
    !(COMMON_TIMEZONES as readonly string[]).includes(timezone) &&
    timezone !== account.timezone;
  const showOriginalExtra =
    !!account &&
    !(COMMON_TIMEZONES as readonly string[]).includes(account.timezone);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!account || timezone === account.timezone) return;
    setLoading(true);
    setError("");
    setSuccess("");

    const res = await fetch("/api/account/timezone", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Error al guardar");
      setLoading(false);
      return;
    }

    const data = (await res.json()) as { timezone: string };
    setAccount({ ...account, timezone: data.timezone });
    setSuccess("Zona horaria actualizada");
    setLoading(false);
  }

  const dirty = !!account && timezone !== account.timezone;

  return (
    <div className="min-h-screen bg-black">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-amber-400 text-xl tracking-widest uppercase">Bardo</h1>
        <Link
          href="/dashboard"
          className="text-sm text-zinc-400 hover:text-amber-400 border border-zinc-700 hover:border-amber-600 px-3 py-2 rounded transition-colors"
        >
          ← Volver
        </Link>
      </header>

      <main className="max-w-xl mx-auto px-4 py-10">
        <h2 className="text-zinc-100 text-lg font-medium mb-6">Mi cuenta</h2>

        {!account && !error && (
          <p className="text-zinc-500 text-sm">Cargando…</p>
        )}

        {account && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-zinc-500 text-xs mb-1.5">Email</label>
              <input
                type="email"
                value={account.email}
                disabled
                className="w-full bg-zinc-900/40 border border-zinc-800 text-zinc-400 px-4 py-3 rounded cursor-not-allowed"
              />
            </div>

            {account.name && (
              <div>
                <label className="block text-zinc-500 text-xs mb-1.5">Nombre</label>
                <input
                  type="text"
                  value={account.name}
                  disabled
                  className="w-full bg-zinc-900/40 border border-zinc-800 text-zinc-400 px-4 py-3 rounded cursor-not-allowed"
                />
              </div>
            )}

            <div>
              <label className="block text-zinc-500 text-xs mb-1.5">
                Zona horaria (la cuota mensual se reinicia el día 1 a las 00:00 de tu zona)
              </label>
              <select
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value);
                  setSuccess("");
                }}
                className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 px-4 py-3 rounded focus:outline-none focus:border-amber-500"
              >
                {showCurrentExtra && (
                  <option value={timezone}>{timezone}</option>
                )}
                {showOriginalExtra && (
                  <option value={account.timezone}>{account.timezone} (actual)</option>
                )}
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-zinc-600 text-xs mt-2 leading-relaxed">
                El consumo del mes se conserva al cambiar de zona. La cuota se
                reiniciará el día 1 a las 00:00 hora local de la zona nueva.
              </p>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            {success && <p className="text-emerald-400 text-sm">{success}</p>}

            <button
              type="submit"
              disabled={loading || !dirty}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-5 py-2.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Guardando…" : "Guardar cambios"}
            </button>
          </form>
        )}

        <section className="mt-12 border-t border-zinc-800 pt-8">
          <h3 className="text-zinc-100 text-base font-medium mb-1">Tarifa de monedas de oro</h3>
          <p className="text-zinc-500 text-xs mb-5 leading-relaxed">
            Tienes 300 monedas de oro al mes. Se reinician el día 1 a las 00:00
            hora local de tu zona horaria.
          </p>
          <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden">
            {TARIFA_ROWS.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-4 px-4 py-3 bg-zinc-900/40">
                <div>
                  <p className="text-zinc-200 text-sm">{row.label}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{row.detail}</p>
                </div>
                <span
                  className={`shrink-0 tabular-nums text-sm font-medium ${
                    row.cost === 0 ? "text-zinc-500" : "text-amber-400"
                  }`}
                >
                  {row.cost === 0 ? "gratis" : `${row.cost} 🪙`}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-zinc-600 text-xs mt-4 leading-relaxed">
            Si subes notas con &quot;Auto-detectar&quot;, el coste depende de la longitud:
            por debajo de ~1000 palabras se cobra como nota corta; por encima, como
            nota larga. Las correcciones breves van siempre a la tarifa baja.
          </p>
        </section>
      </main>
    </div>
  );
}
