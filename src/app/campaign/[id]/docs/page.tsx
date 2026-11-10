"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Doc {
  id: string;
  file_path: string;
  content: string;
  updated_at: string;
}

export default function DocsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params);
  const { status } = useSession();
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Doc | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    // Cargar docs y permisos del usuario
    Promise.all([
      fetch(`/api/campaigns/${campaignId}/docs`).then((r) => r.json()),
      fetch(`/api/campaigns`).then((r) => r.json()),
    ]).then(([docsData, campaignsData]) => {
      setDocs(docsData.docs || []);
      const campaign = (campaignsData.campaigns || []).find(
        (c: { id: string; role: string; can_edit: boolean }) => c.id === campaignId
      );
      if (campaign) {
        setCanEdit(
          campaign.role === "creator" || campaign.role === "master" || campaign.can_edit
        );
      }
      setLoading(false);
    });
  }, [status, campaignId]);

  function openDoc(doc: Doc) {
    setSelected(doc);
    setEditContent(doc.content);
    setSaveMsg("");
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setSaveMsg("");
    const res = await fetch(
      `/api/campaigns/${campaignId}/docs/${encodeURIComponent(selected.file_path)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      }
    );
    if (res.ok) {
      setDocs((prev) =>
        prev.map((d) =>
          d.file_path === selected.file_path ? { ...d, content: editContent } : d
        )
      );
      setSelected((s) => s ? { ...s, content: editContent } : s);
      setSaveMsg("Guardado");
    } else {
      setSaveMsg("Error al guardar");
    }
    setSaving(false);
  }

  if (status === "loading" || loading) return null;

  return (
    <div className="min-h-svh bg-black">
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <Link href={`/campaign/${campaignId}/chat`} className="text-zinc-500 hover:text-zinc-300 text-lg">←</Link>
        <h1 className="font-serif text-amber-400 tracking-wider text-sm uppercase flex-1">
          {selected ? selected.file_path : "Documentación"}
        </h1>
        {selected && (
          <button onClick={() => { setSelected(null); setSaveMsg(""); }}
            className="text-zinc-500 hover:text-zinc-300 text-xs border border-zinc-700 px-3 py-1.5 rounded">
            Volver
          </button>
        )}
      </header>

      {!selected ? (
        <main className="max-w-lg mx-auto px-4 py-6">
          {docs.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">
              <p className="text-3xl mb-3">📂</p>
              <p className="text-sm">No hay documentos todavía.</p>
              <p className="text-xs mt-1">Sube notas para que Bardo genere la documentación.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => openDoc(doc)}
                  className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-amber-600 rounded-xl px-4 py-3 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-200 text-sm group-hover:text-amber-400 transition-colors font-mono">
                      {doc.file_path}
                    </span>
                    <span className="text-zinc-600 text-xs ml-3 shrink-0">
                      {new Date(doc.updated_at).toLocaleDateString("es-ES")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>
      ) : (
        <div className="flex flex-col h-[calc(100svh-53px)]">
          {canEdit ? (
            <>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 bg-black text-zinc-300 text-sm font-mono p-4 resize-none focus:outline-none"
                spellCheck={false}
              />
              <div className="shrink-0 border-t border-zinc-800 px-4 py-3 flex items-center gap-3">
                {saveMsg && (
                  <span className={`text-xs ${saveMsg === "Guardado" ? "text-green-400" : "text-red-400"}`}>
                    {saveMsg}
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || editContent === selected.content}
                  className="ml-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </>
          ) : (
            <pre className="flex-1 overflow-auto p-4 text-zinc-300 text-sm font-mono whitespace-pre-wrap">
              {selected.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
