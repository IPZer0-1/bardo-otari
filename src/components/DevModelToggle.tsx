"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const COOKIE = "llm-provider";
const ONE_MONTH = 60 * 60 * 24 * 30;

type Provider = "anthropic" | "openai";

function readCookie(): Provider {
  if (typeof document === "undefined") return "anthropic";
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return value === "openai" ? "openai" : "anthropic";
}

function writeCookie(value: Provider) {
  document.cookie = `${COOKIE}=${value}; path=/; max-age=${ONE_MONTH}; samesite=lax`;
}

/**
 * Toggle visual de provider de LLM. Solo se renderiza en dev.
 * Persiste la elección en cookie `llm-provider` que el server lee
 * vía getCurrentProvider() para enrutar a gpt-5.6-luna cuando está en
 * "openai", o a Claude Haiku 5.5 cuando está en "anthropic".
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

  const isAnthropic = provider === "anthropic";

  return (
    <div className="fixed bottom-3 right-3 z-50 select-none rounded-full border border-zinc-700 bg-zinc-900/95 backdrop-blur shadow-lg flex items-center text-[11px] font-mono">
      <button
        onClick={() => toggle("anthropic")}
        className={`px-3 py-1.5 rounded-full transition-colors ${
          isAnthropic ? "bg-amber-500 text-black font-semibold" : "text-zinc-400 hover:text-zinc-200"
        }`}
        aria-pressed={isAnthropic}
        title="Anthropic (Claude Haiku 5.5)"
      >
        anthropic
      </button>
      <button
        onClick={() => toggle("openai")}
        className={`px-3 py-1.5 rounded-full transition-colors ${
          !isAnthropic ? "bg-emerald-500 text-black font-semibold" : "text-zinc-400 hover:text-zinc-200"
        }`}
        aria-pressed={!isAnthropic}
        title="OpenAI (gpt-5.6-luna)"
      >
        openai
      </button>
    </div>
  );
}
