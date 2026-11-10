"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Member {
  user_id: string;
  name: string | null;
  email: string;
  role: "creator" | "master" | "player";
  can_invite: boolean;
  can_edit: boolean;
  joined_at: string;
}

interface Campaign {
  id: string;
  name: string;
  invite_code: string;
  role: string;
  can_invite: boolean;
  can_edit: boolean;
}

interface FlaggedUpload {
  id: string;
  created_at: string;
  author: string;
  filename: string | null;
  score: number;
  excerpt: string;
}

const ROLE_LABEL: Record<string, string> = { creator: "Creador", master: "Master", player: "Jugador" };

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [flagged, setFlagged] = useState<FlaggedUpload[]>([]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/campaigns").then((r) => r.json()),
      fetch(`/api/campaigns/${campaignId}/members`).then((r) => r.json()),
    ]).then(([campaignsData, membersData]) => {
      const c = (campaignsData.campaigns || []).find((x: Campaign) => x.id === campaignId);

      const canAccess =
        c &&
        (c.role === "creator" ||
          c.role === "master" ||
          (c.role === "player" && c.can_invite));

      if (!canAccess) {
        router.push(`/campaign/${campaignId}/chat`);
        return;
      }

      setCampaign(c);
      setMyRole(c.role);
      setMembers(membersData.members || []);
      setLoading(false);

      if (c.role === "creator" || c.role === "master") {
        fetch(`/api/campaigns/${campaignId}/flagged-uploads`)
          .then((r) => (r.ok ? r.json() : { uploads: [] }))
          .then((d) => setFlagged(d.uploads || []))
          .catch(() => {});
      }
    });
  }, [status, campaignId, router]);

  async function patch(userId: string, update: Partial<Member>) {
    await fetch(`/api/campaigns/${campaignId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    setMembers((prev) => prev.map((m) => m.user_id === userId ? { ...m, ...update } : m));
  }

  async function remove(userId: string) {
    if (!confirm("¿Expulsar a este miembro?")) return;
    await fetch(`/api/campaigns/${campaignId}/members/${userId}`, { method: "DELETE" });
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  }

  function copyCode() {
    if (!campaign) return;
    navigator.clipboard.writeText(campaign.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (status === "loading" || loading) return null;
  if (!campaign) return null;

  const isManager = myRole === "creator" || myRole === "master";

  return (
    <div className="min-h-svh bg-black">
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <Link href={`/campaign/${campaignId}/chat`} className="text-zinc-500 hover:text-zinc-300 text-lg">←</Link>
        <h1 className="font-serif text-amber-400 tracking-wider text-sm uppercase flex-1">Ajustes</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-8">

        {/* Código de invitación — visible para todos los que acceden */}
        <section>
          <h2 className="text-zinc-400 text-xs uppercase tracking-widest mb-3">Invitar jugadores</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="font-mono text-amber-400 text-lg tracking-widest flex-1">
              {campaign.invite_code}
            </span>
            <button onClick={copyCode}
              className="text-xs text-zinc-400 hover:text-amber-400 border border-zinc-700 hover:border-amber-600 px-3 py-1.5 rounded transition-colors">
              {copied ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
          <p className="text-zinc-600 text-xs mt-2">Comparte este código para que otros se unan a la campaña.</p>
        </section>

        {/* Miembros — solo para creator y master */}
        {isManager && (
          <section>
            <h2 className="text-zinc-400 text-xs uppercase tracking-widest mb-3">
              Miembros ({members.length})
            </h2>
            <div className="space-y-2">
              {members.map((m) => {
                const isMe = m.user_id === session?.user?.id;
                const isCreator = m.role === "creator";
                const showControls = !isCreator && !isMe;

                return (
                  <div key={m.user_id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-zinc-200 text-sm truncate">
                          {m.name || m.email}
                          {isMe && <span className="text-zinc-600 text-xs ml-2">(tú)</span>}
                        </p>
                        <p className="text-zinc-600 text-xs truncate">{m.email}</p>
                      </div>
                      <span className={`text-xs shrink-0 px-2 py-0.5 rounded border ${
                        m.role === "creator" ? "border-amber-700 text-amber-400" :
                        m.role === "master" ? "border-purple-700 text-purple-400" :
                        "border-zinc-700 text-zinc-400"
                      }`}>
                        {ROLE_LABEL[m.role]}
                      </span>
                    </div>

                    {showControls && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {/* Promover/degradar a master — solo creator */}
                        {myRole === "creator" && (
                          <button
                            onClick={() => patch(m.user_id, { role: m.role === "master" ? "player" : "master" })}
                            className="text-xs border border-zinc-700 hover:border-purple-600 text-zinc-400 hover:text-purple-400 px-2.5 py-1 rounded transition-colors"
                          >
                            {m.role === "master" ? "Quitar master" : "Hacer master"}
                          </button>
                        )}

                        {/* Toggle can_edit — creator y master */}
                        <button
                          onClick={() => patch(m.user_id, { can_edit: !m.can_edit })}
                          className={`text-xs border px-2.5 py-1 rounded transition-colors ${
                            m.can_edit
                              ? "border-green-700 text-green-400 hover:border-red-700 hover:text-red-400"
                              : "border-zinc-700 text-zinc-400 hover:border-green-700 hover:text-green-400"
                          }`}
                        >
                          {m.can_edit ? "Edición ✓" : "Dar edición"}
                        </button>

                        {/* Toggle can_invite — creator y master, solo para players */}
                        {m.role !== "master" && (
                          <button
                            onClick={() => patch(m.user_id, { can_invite: !m.can_invite })}
                            className={`text-xs border px-2.5 py-1 rounded transition-colors ${
                              m.can_invite
                                ? "border-green-700 text-green-400 hover:border-red-700 hover:text-red-400"
                                : "border-zinc-700 text-zinc-400 hover:border-green-700 hover:text-green-400"
                            }`}
                          >
                            {m.can_invite ? "Invitar ✓" : "Dar invitar"}
                          </button>
                        )}

                        {/* Expulsar — solo creator */}
                        {myRole === "creator" && (
                          <button
                            onClick={() => remove(m.user_id)}
                            className="text-xs border border-zinc-700 hover:border-red-700 text-zinc-500 hover:text-red-400 px-2.5 py-1 rounded ml-auto transition-colors"
                          >
                            Expulsar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Notas marcadas por el guardrail de Otari — solo creator y master */}
        {isManager && flagged.length > 0 && (
          <section>
            <h2 className="text-zinc-400 text-xs uppercase tracking-widest mb-1">
              Notas a revisar ({flagged.length})
            </h2>
            <p className="text-zinc-600 text-xs mb-3 leading-relaxed">
              Estas notas parecen contener instrucciones dirigidas a la IA (posible
              &quot;prompt injection&quot;). Se integraron igualmente: revisa que los
              documentos de la campaña no hayan cambiado de forma extraña.
            </p>
            <div className="space-y-2">
              {flagged.map((f) => (
                <div key={f.id} className="bg-zinc-900 border border-amber-900/60 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-300 truncate">
                      {f.author}
                      {f.filename && <span className="text-zinc-600"> · {f.filename}</span>}
                    </span>
                    <span className="text-zinc-500 shrink-0">
                      {new Date(f.created_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                      {" · "}
                      <span className="text-amber-400" title="Puntuación del detector (0 = limpia, 1 = inyección)">
                        {f.score.toFixed(2)}
                      </span>
                    </span>
                  </div>
                  <p className="text-zinc-400 text-xs mt-2 whitespace-pre-wrap break-words line-clamp-4">
                    {f.excerpt}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
