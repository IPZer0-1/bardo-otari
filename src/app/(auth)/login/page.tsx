"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = e.currentTarget;
    const res = await signIn("credentials", {
      email: form.email.value,
      password: form.password.value,
      redirect: false,
    });
    if (res?.error) {
      setError("Credenciales incorrectas");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-black px-4">
      <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-amber-400 tracking-widest uppercase">Bardo</h1>
          <p className="text-zinc-500 text-sm mt-1">La memoria de tu campaña</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 px-4 py-3 rounded focus:outline-none focus:border-amber-500 placeholder-zinc-600"
            />
          </div>
          <div>
            <input
              name="password"
              type="password"
              placeholder="Contraseña"
              required
              className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 px-4 py-3 rounded focus:outline-none focus:border-amber-500 placeholder-zinc-600"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-6">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="text-amber-400 hover:text-amber-300">
            Regístrate
          </Link>
        </p>
      </div>
      </div>
      <LegalFooter />
    </div>
  );
}
