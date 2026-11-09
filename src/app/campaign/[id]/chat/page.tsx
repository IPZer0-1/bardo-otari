"use client";

import { useState, useRef, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import GoldBalance from "@/components/GoldBalance";
import { GOLD_COSTS } from "@/lib/quota-costs";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  created_at: string;
}

interface BatchJob {
  custom_id: string;
  filename: string | null;
  status: "processing" | "done" | "failed";
  created_at: string;
  completed_at: string | null;
  just_completed?: { updated_files: string[]; conflicts: number };
}

function formatConvDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatBatchDate(iso: string | null) {
  if (!iso) return "Pendiente";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function uniqueFilePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params);
  const { status } = useSession();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [canAccessSettings, setCanAccessSettings] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [showConvList, setShowConvList] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Cargar permisos y conversaciones al montar
  useEffect(() => {
    if (status !== "authenticated") return;

    Promise.all([
      fetch("/api/campaigns").then((r) => r.json()),
      fetch(`/api/campaigns/${campaignId}/conversations`).then((r) => r.json()),
    ]).then(([campaignsData, convsData]) => {
      const c = (campaignsData.campaigns || []).find(
        (x: { id: string; role: string; can_invite: boolean }) => x.id === campaignId
      );
      if (c) {
        setCanAccessSettings(
          c.role === "creator" || c.role === "master" || c.can_invite === true
        );
      }

      const convs: Conversation[] = convsData.conversations || [];
      setConversations(convs);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, campaignId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadConversation(convId: string) {
    setActiveConvId(convId);
    setShowConvList(false);
    const res = await fetch(`/api/campaigns/${campaignId}/conversations/${convId}`);
    const data = await res.json();
    setMessages(
      (data.messages || []).map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    );
  }

  async function handleNewConversation() {
    const res = await fetch(`/api/campaigns/${campaignId}/conversations`, { method: "POST" });
    const data = await res.json();
    const newConv: Conversation = data.conversation;
    setConversations((prev) => {
      const updated = [newConv, ...prev].slice(0, 5);
      return updated;
    });
    setActiveConvId(newConv.id);
    setMessages([]);
    setShowConvList(false);
    inputRef.current?.focus();
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          question,
          conversation_id: activeConvId,
        }),
      });
      const data = await res.json();

      // Si la API creó una nueva conversación (primera pregunta sin conv activa), registrarla
      if (data.conversation_id && !activeConvId) {
        const newConv: Conversation = { id: data.conversation_id, created_at: new Date().toISOString() };
        setConversations((prev) => [newConv, ...prev].slice(0, 5));
        setActiveConvId(data.conversation_id);
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer || data.error || "Error inesperado" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error de conexión. Inténtalo de nuevo." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
      window.dispatchEvent(new Event("quota:changed"));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function handleCheckIngests() {
    setShowBatchModal(true);
    setBatchLoading(true);
    setBatchError("");

    try {
      const res = await fetch("/api/ingest/batch/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setBatchError(data.error || "No se pudieron consultar las ingestas.");
        setBatchJobs([]);
        return;
      }

      setBatchJobs(data.jobs || []);
    } catch {
      setBatchError("Error de conexión al consultar las ingestas.");
      setBatchJobs([]);
    } finally {
      setBatchLoading(false);
    }
  }

  if (status === "loading") return null;

  // Componente de lista de conversaciones (compartido entre sidebar y dropdown)
  const ConvList = () => (
    <>
      <div className="px-3 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-zinc-400 text-xs uppercase tracking-widest">Chats</span>
        <button
          onClick={handleNewConversation}
          className="text-xs text-amber-400 hover:text-amber-300 font-medium"
        >
          + Nuevo
        </button>
      </div>
      {conversations.length === 0 ? (
        <p className="text-zinc-600 text-xs px-3 py-6 text-center">Sin conversaciones</p>
      ) : (
        conversations.map((conv, i) => (
          <button
            key={conv.id}
            onClick={() => loadConversation(conv.id)}
            className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-2 ${
              conv.id === activeConvId
                ? "bg-zinc-800 text-amber-400"
                : "text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <span className="text-zinc-600 text-xs w-4 shrink-0">{i + 1}</span>
            <span className="truncate text-xs">{formatConvDate(conv.created_at)}</span>
          </button>
        ))
      )}
    </>
  );

  return (
    <div className="flex h-svh bg-black">

      {/* Sidebar — solo desktop */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-zinc-800">
        <div className="px-4 py-4 border-b border-zinc-800">
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            ← Dashboard
          </Link>
        </div>
        <ConvList />
      </aside>

      {/* Área principal */}
      <div className="flex flex-col flex-1 min-w-0">

      {/* Header */}
      <header className="shrink-0 border-b border-zinc-700 px-4 py-4 flex items-center gap-3">
        {/* Flecha back — solo mobile */}
        <Link href="/dashboard" className="md:hidden text-zinc-300 hover:text-white text-xl leading-none font-medium">
          ←
        </Link>
        <h1 className="font-serif text-amber-400 tracking-wider text-base font-bold uppercase flex-1 truncate">
          <span className="hidden sm:inline">Consulta</span>
          <span className="sm:hidden">Bardo</span>
        </h1>
        <nav className="flex items-center gap-2">
          {/* Selector de conversaciones — solo mobile */}
          <div className="relative md:hidden">
            <button
              onClick={() => setShowConvList((v) => !v)}
              className="text-sm text-zinc-400 hover:text-amber-400 border border-zinc-700 hover:border-amber-600 px-3 py-2 rounded transition-colors flex items-center gap-1.5"
              title="Conversaciones"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
              </svg>
              <span>{conversations.length}</span>
            </button>
            {showConvList && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-10 overflow-hidden">
                <ConvList />
              </div>
            )}
          </div>

          <GoldBalance />

          <Link href={`/campaign/${campaignId}/upload`} className="text-sm font-medium text-zinc-300 hover:text-amber-400 border border-zinc-600 hover:border-amber-500 px-2.5 py-2 md:px-3 rounded transition-colors flex items-center gap-1.5" title="Subir notas">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
            </svg>
            <span className="hidden md:inline">+ Notas</span>
          </Link>
          <button
            onClick={handleCheckIngests}
            className="text-sm font-medium text-zinc-300 hover:text-amber-400 border border-zinc-600 hover:border-amber-500 px-2.5 py-2 md:px-3 rounded transition-colors flex items-center gap-1.5"
            title="Estado de carga de notas"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14h2V5h14V3zm-3 4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 14H8V9h8v12zm-6-2h4v-2h-4v2zm0-4h4v-2h-4v2zm0-4h4V9h-4v2z"/>
            </svg>
            <span className="hidden md:inline">Estado</span>
          </button>
          <Link href={`/campaign/${campaignId}/docs`} className="text-sm font-medium text-zinc-300 hover:text-amber-400 border border-zinc-600 hover:border-amber-500 px-2.5 py-2 md:px-3 rounded transition-colors flex items-center gap-1.5" title="Documentación">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            <span className="hidden md:inline">Docs</span>
          </Link>
          {canAccessSettings && (
            <Link href={`/campaign/${campaignId}/settings`} className="text-zinc-300 hover:text-amber-400 border border-zinc-600 hover:border-amber-500 px-2.5 py-2 rounded transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </Link>
          )}
        </nav>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" onClick={() => setShowConvList(false)}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-8">
            <p className="text-4xl">📜</p>
            <p className="text-zinc-400 text-base max-w-xs">
              Pregunta sobre personajes, hilos de trama, profecías, lore…
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
              {[
                "¿Qué pasó en la última sesión?",
                "¿Cuál es el siguiente objetivo?",
                "¿Qué hilos de trama están pendientes?",
                "Resumen de los personajes del grupo",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-left text-sm font-medium text-zinc-300 border border-zinc-700 hover:border-amber-500 hover:text-amber-400 px-4 py-3 rounded-lg transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-amber-500 text-black rounded-br-sm"
                  : "bg-zinc-900 text-zinc-100 border border-zinc-800 rounded-bl-sm"
              }`}
            >
              {msg.role === "user" ? (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              ) : (
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-amber-400 font-bold text-base mb-2 mt-1">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-amber-300 font-semibold text-sm mb-1.5 mt-3 first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-zinc-200 font-semibold text-sm mb-1 mt-2 first:mt-0">{children}</h3>,
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2 text-zinc-200">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2 text-zinc-200">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    strong: ({ children }) => <strong className="text-zinc-100 font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="text-zinc-300 italic">{children}</em>,
                    hr: () => <hr className="border-zinc-700 my-3" />,
                    blockquote: ({ children }) => <blockquote className="border-l-2 border-amber-600 pl-3 text-zinc-400 italic my-2">{children}</blockquote>,
                    code: ({ children }) => <code className="bg-zinc-800 text-amber-300 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-zinc-800 px-3 py-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregunta sobre la campaña…"
            rows={1}
            className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-amber-500 text-zinc-100 placeholder-zinc-600 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors max-h-32"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <span
            className="shrink-0 tabular-nums text-[11px] font-medium text-zinc-500 border border-zinc-800 bg-zinc-900/60 rounded-lg h-11 px-2 flex items-center select-none"
            title={`Cada consulta gasta ${GOLD_COSTS.query} moneda de oro`}
            aria-label={`Coste por consulta: ${GOLD_COSTS.query} moneda`}
          >
            {GOLD_COSTS.query}🪙
          </span>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black rounded-xl w-11 h-11 flex items-center justify-center transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
        <p className="text-zinc-500 text-xs text-center mt-2">Enter para enviar · Shift+Enter para nueva línea</p>
      </div>

      {showBatchModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <button
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/70"
            onClick={() => setShowBatchModal(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold tracking-wide text-amber-400 uppercase">Estado de carga de notas</h2>
                <p className="text-zinc-500 text-xs mt-1">Consulta si las notas en segundo plano ya se han aplicado.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCheckIngests}
                  disabled={batchLoading}
                  className="text-xs border border-zinc-700 hover:border-amber-500 disabled:opacity-50 text-zinc-300 hover:text-amber-400 px-3 py-1.5 rounded transition-colors"
                >
                  {batchLoading ? "Consultando..." : "Consultar"}
                </button>
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="text-zinc-500 hover:text-zinc-300 text-lg leading-none px-2"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="max-h-[70svh] overflow-y-auto px-4 py-4">
              {batchError && (
                <p className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  {batchError}
                </p>
              )}

              {!batchError && batchLoading && batchJobs.length === 0 && (
                <p className="text-zinc-500 text-sm">Consultando estado de las ingestas…</p>
              )}

              {!batchLoading && !batchError && batchJobs.length === 0 && (
                <p className="text-zinc-500 text-sm">No hay ingestas batch recientes en esta campaña.</p>
              )}

              <div className="space-y-3">
                {batchJobs.map((job) => (
                  <div key={job.custom_id} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-200 truncate">
                          {job.filename || "Notas pegadas en texto libre"}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                          Enviada: {formatBatchDate(job.created_at)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Estado final: {formatBatchDate(job.completed_at)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded border px-2 py-0.5 text-xs ${
                          job.status === "done"
                            ? "border-green-800 text-green-400"
                            : job.status === "failed"
                              ? "border-red-800 text-red-400"
                              : "border-amber-800 text-amber-400"
                        }`}
                      >
                        {job.status === "done" ? "Completada" : job.status === "failed" ? "Fallida" : "Procesando"}
                      </span>
                    </div>

                    {job.just_completed && (
                      <div className="mt-3 rounded-lg border border-green-900 bg-green-950/20 px-3 py-2">
                        <p className="text-xs font-medium text-green-400">Se acaba de aplicar en esta consulta.</p>
                        {uniqueFilePaths(job.just_completed.updated_files).length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {uniqueFilePaths(job.just_completed.updated_files).map((file) => (
                              <p key={file} className="text-xs text-zinc-300">· {file}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-zinc-500">No se detectaron cambios nuevos.</p>
                        )}
                        {job.just_completed.conflicts > 0 && (
                          <p className="mt-2 text-xs text-amber-400">
                            ⚠ {job.just_completed.conflicts} discrepancia{job.just_completed.conflicts > 1 ? "s" : ""} registrada{job.just_completed.conflicts > 1 ? "s" : ""}.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </div> {/* fin área principal */}
    </div>
  );
}
