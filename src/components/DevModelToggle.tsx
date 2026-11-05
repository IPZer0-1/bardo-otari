"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const COOKIE = "llm-provider";
const ONE_MONTH = 60 * 60 * 24 * 30;

type Provider = "anthropic" | "openai" | "otari";

const OPTIONS: { value: Provider; active: string; title: string }[] = [
  { value: "anthropic", active: "bg-amber-500", title: "Anthropic (Claude Haiku 5.5)" },
  { value: "openai", active: "bg-emerald-500", title: "OpenAI (gpt-5.6-luna)" },
  // Sin OTARI_API_KEY el servidor ignora la cookie y usa el proveedor por defecto.
  { value: "otari", active: "bg-violet-400", title: "Otari (gateway de Mozilla.ai)" },
];

function readCookie(): Provider {
  if (typeof document === "undefined") return "anthropic";
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return value === "openai" || value === "otari" ? value : "anthropic";
}

function writeCookie(value: Provider) {
  document.cookie = `${COOKIE}=${value}; path=/; max-age=${ONE_MONTH}; samesite=lax`;
}

/**
 * Toggle visual de provider de LLM. Solo se renderiza en dev.
 * Persiste la elección en cookie `llm-provider` que el server lee
 * vía getCurrentProvider() para enrutar a gpt-5.6-luna ("openai"), a
 * Claude Haiku 5.5 ("anthropic") o al gateway Otari ("otari").
 */
export default function DevModelToggle() {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setProvider(readCookie());
    setMounted(true);
  }, []);

  if (process.env.NODE_ENV !== "development") return null;
  if (!mounted) return null;

  function toggle(next: Provider) {
    if (next === provider) return;
    writeCookie(next);
    setProvider(next);
    router.refresh();
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 select-none rounded-full border border-zinc-700 bg-zinc-900/95 backdrop-blur shadow-lg flex items-center text-[11px] font-mono">
      {OPTIONS.map((opt) => (
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
