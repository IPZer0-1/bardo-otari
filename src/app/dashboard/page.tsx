"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  role: string;
  created_at: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/campaigns")
        .then((r) => r.json())
        .then((d) => setCampaigns(d.campaigns || []));
    }
  }, [status]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, description: newDesc }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setCampaigns((prev) => [{ ...data.campaign, role: "creator" }, ...prev]);
    setShowNew(false);
    setNewName("");
    setNewDesc("");
    setLoading(false);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/campaigns/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: joinCode }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    router.push(`/campaign/${data.campaign_id}/chat`);
  }

  if (status === "loading") return null;

  const roleLabel: Record<string, string> = { creator: "Creador", master: "Master", player: "Jugador" };

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-amber-400 text-xl tracking-widest uppercase">Bardo</h1>

        {/* Menú de cuenta */}
        <div className="relative">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-black font-bold text-sm select-none">
              {(session?.user?.name || session?.user?.email || "?")[0].toUpperCase()}
            </div>
            <span className="text-zinc-300 text-sm hidden sm:block max-w-[160px] truncate">
              {session?.user?.name || session?.user?.email}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-500">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </button>

          {showMenu && (
            <>
              {/* Overlay para cerrar */}
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-20 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                  <p className="text-zinc-200 text-sm font-medium truncate">{session?.user?.name || "Sin nombre"}</p>
                  <p className="text-zinc-500 text-xs truncate mt-0.5">{session?.user?.email}</p>
                </div>
                <Link
                  href="/account"
                  onClick={() => setShowMenu(false)}
                  className="block w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-amber-400 transition-colors"
                >
                  Mi cuenta
                </Link>
                {session?.user?.is_admin && (
                  <Link
                    href="/admin"
                    onClick={() => setShowMenu(false)}
                    className="block w-full text-left px-4 py-3 text-sm text-amber-300 hover:bg-zinc-800 hover:text-amber-200 transition-colors border-t border-zinc-800"
                  >
                    Panel admin
                  </Link>
                )}
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-zinc-800 transition-colors border-t border-zinc-800"
                >
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-zinc-100 text-lg font-medium">Mis campañas</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowJoin(!showJoin); setShowNew(false); setError(""); }}
              className="text-sm border border-zinc-700 text-zinc-300 hover:border-amber-500 hover:text-amber-400 px-4 py-2 rounded transition-colors"
            >
              Unirse
            </button>
            <button
              onClick={() => { setShowNew(!showNew); setShowJoin(false); setError(""); }}
              className="text-sm bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded transition-colors"
            >
              Nueva campaña
            </button>
          </div>
        </div>

        {/* Form nueva campaña */}
        {showNew && (
          <form onSubmit={handleCreate} className="mb-6 bg-zinc-900 border border-zinc-800 rounded p-4 space-y-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre de la campaña"
              required
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 px-3 py-2 rounded text-sm focus:outline-none focus:border-amber-500 placeholder-zinc-600"
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Descripción (opcional)"
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 px-3 py-2 rounded text-sm focus:outline-none focus:border-amber-500 placeholder-zinc-600"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-4 py-2 rounded disabled:opacity-50">
              {loading ? "Creando..." : "Crear"}
            </button>
          </form>
        )}

        {/* Form unirse */}
        {showJoin && (
          <form onSubmit={handleJoin} className="mb-6 bg-zinc-900 border border-zinc-800 rounded p-4 space-y-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Código de invitación"
              required
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 px-3 py-2 rounded text-sm focus:outline-none focus:border-amber-500 placeholder-zinc-600"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-4 py-2 rounded disabled:opacity-50">
              {loading ? "Uniéndose..." : "Unirse"}
            </button>
          </form>
        )}

        {/* Lista de campañas */}
        {campaigns.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <p className="text-4xl mb-4">⚔️</p>
            <p>No tienes campañas todavía.</p>
            <p className="text-sm mt-1">Crea una nueva o únete con un código.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/campaign/${c.id}/chat`}
                className="block bg-zinc-900 border border-zinc-800 hover:border-amber-600 rounded p-4 transition-colors group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-zinc-100 font-medium group-hover:text-amber-400 transition-colors">{c.name}</h3>
                    {c.description && <p className="text-zinc-500 text-sm mt-1">{c.description}</p>}
                  </div>
                  <span className="text-xs text-zinc-600 border border-zinc-700 rounded px-2 py-0.5 ml-4 shrink-0">
                    {roleLabel[c.role] || c.role}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
