"use client";

import { useCallback, useEffect, useState } from "react";

type QuotaState = {
  used: number;
  cap: number;
  remaining: number;
  timezone: string;
  reset_at: string;
};

export default function GoldBalance() {
  const [data, setData] = useState<QuotaState | null>(null);
  const [error, setError] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/quota/balance", { cache: "no-store" });
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = (await res.json()) as QuotaState;
      setData(json);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    refetch();
    const onChange = () => refetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("quota:changed", onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("quota:changed", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  if (error) return null;

  const remaining = data?.remaining ?? null;
  const cap = data?.cap ?? null;
  const ratio = data && data.cap > 0 ? data.remaining / data.cap : 1;

  const tone =
    ratio <= 0.1
      ? "text-red-400 border-red-700"
      : ratio <= 0.2
      ? "text-orange-400 border-orange-700"
      : "text-amber-400 border-amber-700/60";

  const resetLabel =
    data == null
      ? null
      : new Intl.DateTimeFormat("es-ES", {
          timeZone: data.timezone,
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date(data.reset_at));

  const title =
    data == null
      ? "Cargando saldo de monedas…"
      : `Te quedan ${remaining} de ${cap} monedas de oro este mes (reset ${resetLabel} ${data.timezone})`;

  return (
    <div
      title={title}
      className={`text-sm font-medium ${tone} bg-zinc-900/60 border px-2.5 py-2 md:px-3 rounded flex items-center gap-1.5 cursor-default select-none`}
      aria-label={title}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <circle cx="12" cy="12" r="5.5" />
      </svg>
      <span className="tabular-nums">
        {remaining == null ? "—" : `${remaining}/${cap}`}
      </span>
    </div>
  );
}
