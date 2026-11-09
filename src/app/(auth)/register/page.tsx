"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";
import { COMMON_TIMEZONES, FALLBACK_TIMEZONE } from "@/lib/timezone";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [timezone, setTimezone] = useState<string>(FALLBACK_TIMEZONE);

  // Auto-detección al montar. Si el navegador da una zona que no está en
  // la lista común (p.ej. America/Tegucigalpa para alguien en Honduras),
  // la añadimos como opción extra y la dejamos seleccionada.
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && typeof detected === "string") {
        setTimezone(detected);
      }
    } catch {
      // navegadores muy antiguos: dejamos el default
    }
  }, []);

  const showDetectedExtra = !(COMMON_TIMEZONES as readonly string[]).includes(timezone);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = e.currentTarget;

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email.value,
        password: form.password.value,
        name: form.username.value,
        code: form.code.value.trim().toUpperCase(),
        timezone,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al registrarse");
      setLoading(false);
    } else {
      router.push("/login?registered=1");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-black px-4">
      <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-amber-400 tracking-widest uppercase">Bardo</h1>
          <p className="text-zinc-500 text-sm mt-1">Crea tu cuenta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="username"
            type="text"
            placeholder="Tu nombre o alias"
            required
            className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 px-4 py-3 rounded focus:outline-none focus:border-amber-500 placeholder-zinc-600"
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 px-4 py-3 rounded focus:outline-none focus:border-amber-500 placeholder-zinc-600"
          />
          <input
            name="password"
            type="password"
            placeholder="Contraseña (mínimo 8 caracteres)"
            required
            minLength={8}
            className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 px-4 py-3 rounded focus:outline-none focus:border-amber-500 placeholder-zinc-600"
          />
          <input
            name="code"
            type="text"
            placeholder="Código de invitación"
            required
            className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 px-4 py-3 rounded focus:outline-none focus:border-amber-500 placeholder-zinc-600 uppercase tracking-wider"
          />

          <div>
            <label className="block text-zinc-500 text-xs mb-1.5">
              Zona horaria (la cuota mensual se reinicia el día 1 a las 00:00 de tu zona)
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 px-4 py-3 rounded focus:outline-none focus:border-amber-500"
            >
              {showDetectedExtra && (
                <option value={timezone}>{timezone} (detectada)</option>
              )}
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-6">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-amber-400 hover:text-amber-300">
            Entra aquí
          </Link>
        </p>
        <p className="text-center text-zinc-600 text-xs mt-4 leading-relaxed">
          Al registrarte aceptas las{" "}
          <Link href="/terms" className="hover:text-zinc-400">condiciones</Link>{" "}
          y la{" "}
          <Link href="/privacy" className="hover:text-zinc-400">política de privacidad</Link>.
        </p>
      </div>
      </div>
      <LegalFooter />
    </div>
  );
}
