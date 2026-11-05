"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LlmProvider as Provider } from "@/lib/llm-provider";

const OPTIONS: { value: Provider; label: string; active: string }[] = [
  { value: "anthropic", label: "Anthropic", active: "bg-amber-500 text-black font-semibold" },
  { value: "openai", label: "OpenAI", active: "bg-emerald-500 text-black font-semibold" },
  { value: "otari", label: "Otari (gateway)", active: "bg-violet-400 text-black font-semibold" },
];

export default function ProviderToggle({
  current,
  available,
}: {
  current: Provider;
  /** Opciones que se pueden elegir (Otari solo si hay OTARI_API_KEY). */
  available: Provider[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(provider: Provider) {
    if (provider === current || saving) return;
    setSaving(provider);
    setError(null);
    try {
      const res = await fetch("/api/admin/llm-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(`No se pudo guardar (${(err as Error).message}).`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <div className="inline-flex rounded-full border border-zinc-700 bg-zinc-950 p-1 text-sm">
        {OPTIONS.filter((opt) => available.includes(opt.value)).map((opt) => (
          <button
            key={opt.value}
            onClick={() => choose(opt.value)}
            disabled={saving !== null}
            aria-pressed={current === opt.value}
            className={`px-4 py-1.5 rounded-full transition-colors disabled:opacity-60 ${
              current === opt.value ? opt.active : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {saving === opt.value ? "Guardando…" : opt.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
