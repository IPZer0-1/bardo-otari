"use client";

import { useRouter } from "next/navigation";

const COOKIE = "llm-provider";
const ONE_MONTH = 60 * 60 * 24 * 30;

type Provider = "anthropic" | "openai" | "otari";

const OPTIONS: { value: Provider; active: string; title: string }[] = [
  { value: "anthropic", active: "bg-amber-500", title: "Anthropic (Claude Haiku 5.5)" },
  { value: "openai", active: "bg-emerald-500", title: "OpenAI (gpt-5.6-luna)" },
  // Solo se muestra si hay OTARI_API_KEY (prop otariAvailable).
  { value: "otari", active: "bg-violet-400", title: "Otari (gateway de Mozilla.ai)" },
];

function writeCookie(value: Provider) {
  document.cookie = `${COOKIE}=${value}; path=/; max-age=${ONE_MONTH}; samesite=lax`;
}

/**
 * Toggle visual de provider de LLM. Solo se renderiza en dev.
 * Persiste la elección en cookie `llm-provider` que el server lee
 * vía getCurrentProvider() para enrutar a gpt-5.6-luna ("openai"), a
 * Claude Haiku 5.5 ("anthropic") o al gateway Otari ("otari").
 */
export default function DevModelToggle({
  current,
  otariAvailable,
}: {
  /** Provider que usa el servidor de verdad (cookie, panel admin o default). */
  current: Provider;
  otariAvailable: boolean;
}) {
  const router = useRouter();
  // Se pinta lo que usa el servidor: tras router.refresh() llega el nuevo valor.
  const provider = current;

  if (process.env.NODE_ENV !== "development") return null;

  function toggle(next: Provider) {
    if (next === provider) return;
    writeCookie(next);
    router.refresh();
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 select-none rounded-full border border-zinc-700 bg-zinc-900/95 backdrop-blur shadow-lg flex items-center text-[11px] font-mono">
      {OPTIONS.filter((opt) => opt.value !== "otari" || otariAvailable).map((opt) => (
        <button
          key={opt.value}
          onClick={() => toggle(opt.value)}
          className={`px-3 py-1.5 rounded-full transition-colors ${
            provider === opt.value
              ? `${opt.active} text-black font-semibold`
              : "text-zinc-400 hover:text-zinc-200"
          }`}
          aria-pressed={provider === opt.value}
          title={opt.title}
        >
          {opt.value}
        </button>
      ))}
    </div>
  );
}
