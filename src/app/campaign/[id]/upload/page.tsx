"use client";

import { useState, useRef, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Tab = "text" | "file";
type Kind = "auto" | "session" | "correction" | "entity";
type EntityKind = "pnj" | "lugar";

interface SyncIngestResult {
  status: "done";
  mode: "sync" | "correction" | "entity";
  updated_files: string[];
  conflicts: number;
}

interface BatchIngestResult {
  status: "processing";
  mode: "batch";
  batch_id: string;
  custom_id: string;
  word_count: number;
  auto_batch: boolean;
}

interface DuplicateIngestResult {
  status: "duplicate";
  original_upload_id: string | null;
  ingested_at: string;
}

type IngestResult = SyncIngestResult | BatchIngestResult | DuplicateIngestResult;

const KIND_OPTIONS: { value: Kind; label: string; help: string; cost: string }[] = [
  { value: "auto", label: "Auto-detectar", help: "Recomendado. Detecta tipo según contenido y longitud.", cost: "1–10" },
  { value: "session", label: "Crónica de sesión", help: "Notas largas, narrativas. Procesa con el modelo principal.", cost: "2–10" },
  { value: "correction", label: "Corrección puntual", help: "Cambio breve sobre algo ya documentado. Modelo barato.", cost: "1" },
  { value: "entity", label: "Nuevo PNJ / lugar", help: "Formulario estructurado, sin LLM.", cost: "0" },
];

const ENTITY_KIND_TARGET: Record<EntityKind, string> = {
  pnj: "campaign/personajes.md",
  lugar: "campaign/islas.md",
};

const ENTITY_KIND_LABEL: Record<EntityKind, string> = {
  pnj: "PNJ",
  lugar: "Lugar / isla",
};

function formatIngestedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
}

function uniqueFilePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

function buildEntityMarkdown(name: string, notes: string): string {
  const heading = `### ${name.trim()}`;
  const body = notes.trim();
  return body ? `${heading}\n\n${body}` : heading;
}

export default function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params);
  const { status } = useSession();
  const router = useRouter();

  const [kind, setKind] = useState<Kind>("auto");
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [entityKind, setEntityKind] = useState<EntityKind>("pnj");
  const [entityName, setEntityName] = useState("");
  const [entityNotes, setEntityNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const syncUpdatedFiles = result && result.status === "done" ? uniqueFilePaths(result.updated_files) : [];

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  function resetInputs() {
    setText("");
    setFile(null);
    setEntityName("");
    setEntityNotes("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const form = new FormData();
      form.append("campaign_id", campaignId);
      form.append("kind", kind);

      if (kind === "entity") {
        if (!entityName.trim()) {
          setError("Indica el nombre");
          setLoading(false);
          return;
        }
        const targetFile = ENTITY_KIND_TARGET[entityKind];
        const markdown = buildEntityMarkdown(entityName, entityNotes);
        form.append("target_file", targetFile);
        form.append("entity_markdown", markdown);
        form.append("text", markdown);
      } else if (tab === "text") {
        if (!text.trim()) {
          setError("Escribe algo primero");
          setLoading(false);
          return;
        }
        form.append("text", text);
      } else {
        if (!file) {
          setError("Selecciona un fichero");
          setLoading(false);
          return;
        }
        form.append("file", file);
      }

      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        const baseMessage = data.error || "Error al procesar";
        const details: unknown = data.details;
        const detailLines = Array.isArray(details) ? details.filter((d): d is string => typeof d === "string") : [];
        setError(detailLines.length > 0 ? `${baseMessage}: ${detailLines.join("; ")}` : baseMessage);
      } else {
        setResult(data);
        resetInputs();
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  const activeKindOption = KIND_OPTIONS.find((o) => o.value === kind);

  return (
    <div className="min-h-svh bg-black">
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <Link href={`/campaign/${campaignId}/chat`} className="text-zinc-500 hover:text-zinc-300 text-lg">
          ←
        </Link>
        <h1 className="font-serif text-amber-400 tracking-wider text-sm uppercase flex-1">
          Subir notas
        </h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <p className="text-zinc-500 text-sm mb-6">
          Escribe o sube tus notas de sesión. Claude las integrará en la documentación de la campaña.
        </p>

        {result && result.status === "done" && (
          <div className="mb-6 bg-zinc-900 border border-green-800 rounded-xl p-4">
            <p className="text-green-400 font-medium text-sm mb-2">
              ✓ {result.mode === "entity" ? "Entidad añadida" : result.mode === "correction" ? "Corrección aplicada" : "Notas integradas"}
            </p>
            {syncUpdatedFiles.length > 0 ? (
              <div className="text-zinc-400 text-xs space-y-1">
                <p className="text-zinc-500 mb-1">Documentos actualizados:</p>
                {syncUpdatedFiles.map((f) => (
                  <p key={f} className="pl-2 text-zinc-300">· {f}</p>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-xs">No se detectaron cambios nuevos.</p>
            )}
            {result.conflicts > 0 && (
              <p className="text-amber-400 text-xs mt-2">
                ⚠ {result.conflicts} discrepancia{result.conflicts > 1 ? "s" : ""} registrada{result.conflicts > 1 ? "s" : ""} con versiones anteriores.
              </p>
            )}
          </div>
        )}
        {result && result.status === "processing" && (
          <div className="mb-6 bg-zinc-900 border border-amber-700 rounded-xl p-4 space-y-3">
            <p className="text-amber-400 font-medium text-sm">⌛ Ingesta enviada en segundo plano</p>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Estas notas se han enviado a procesamiento batch para reducir coste. El resultado puede tardar entre 1 hora y 24 horas.
            </p>
            <p className="text-zinc-500 text-xs">
              Puedes cerrar esta página. Dentro de la campaña tienes el botón <span className="text-zinc-300">Ingestas</span> para consultar si ya se aplicaron los cambios.
            </p>
            <p className="text-zinc-600 text-xs">
              Longitud detectada: {result.word_count} palabras.
            </p>
            <Link
              href={`/campaign/${campaignId}/chat`}
              className="inline-flex text-xs font-medium text-amber-400 hover:text-amber-300 border border-amber-700 hover:border-amber-500 px-3 py-2 rounded transition-colors"
            >
              Ir a la campaña
            </Link>
          </div>
        )}
        {result && result.status === "duplicate" && (
          <div className="mb-6 bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-2">
            <p className="text-zinc-300 font-medium text-sm">↺ Esta nota ya estaba integrada</p>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Detectamos el mismo contenido procesado el {formatIngestedAt(result.ingested_at)}. No se ha vuelto a llamar al modelo ni se han alterado los documentos.
            </p>
          </div>
        )}

        {/* Selector de tipo de ingesta */}
        <div className="mb-4">
          <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-2">Tipo de ingesta</label>
          <div className="grid grid-cols-2 gap-2">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setKind(opt.value)}
                className={`text-left rounded-lg px-3 py-2 text-xs border transition-colors flex items-start justify-between gap-2 ${
                  kind === opt.value
                    ? "border-amber-500 bg-amber-500/10 text-amber-200"
                    : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                <span className="block font-medium">{opt.label}</span>
                <span
                  className={`shrink-0 text-[10px] tabular-nums px-1.5 py-0.5 rounded border ${
                    kind === opt.value
                      ? "border-amber-500/60 text-amber-300"
                      : "border-zinc-700 text-zinc-500"
                  }`}
                  title={opt.value === "entity" ? "Sin coste" : `Coste en monedas de oro: ${opt.cost}`}
                >
                  {opt.cost === "0" ? "gratis" : `${opt.cost}🪙`}
                </span>
              </button>
            ))}
          </div>
          {activeKindOption && (
            <p className="text-zinc-600 text-xs mt-2">{activeKindOption.help}</p>
          )}
        </div>

        {kind !== "entity" && (
          <div className="flex border-b border-zinc-800 mb-4">
            {(["text", "file"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm transition-colors ${
                  tab === t
                    ? "text-amber-400 border-b-2 border-amber-500"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t === "text" ? "Texto libre" : "Fichero"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {kind === "entity" ? (
            <>
              <div>
                <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-2">Tipo</label>
                <div className="flex gap-2">
                  {(Object.keys(ENTITY_KIND_LABEL) as EntityKind[]).map((ek) => (
                    <button
                      key={ek}
                      type="button"
                      onClick={() => setEntityKind(ek)}
                      className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                        entityKind === ek
                          ? "border-amber-500 bg-amber-500/10 text-amber-200"
                          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                      }`}
                    >
                      {ENTITY_KIND_LABEL[ek]}
                    </button>
                  ))}
                </div>
                <p className="text-zinc-600 text-xs mt-2">
                  Se añadirá al final de <span className="text-zinc-400">{ENTITY_KIND_TARGET[entityKind]}</span>.
                </p>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-2">Nombre</label>
                <input
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  placeholder={entityKind === "pnj" ? "p. ej. Acastus" : "p. ej. Mytros"}
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-500 text-zinc-100 placeholder-zinc-600 rounded-xl px-4 py-2 text-sm focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-2">Notas (opcional)</label>
                <textarea
                  value={entityNotes}
                  onChange={(e) => setEntityNotes(e.target.value)}
                  placeholder="Datos breves: rol, ubicación, relación con el grupo…"
                  rows={5}
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-500 text-zinc-100 placeholder-zinc-600 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors"
                />
                <p className="text-zinc-600 text-xs mt-2">
                  Append determinista, sin coste de modelo.
                </p>
              </div>
            </>
          ) : tab === "text" ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribe lo que recuerdas de la sesión: qué pasó, con quién hablasteis, qué descubristeis…"
                rows={10}
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-500 text-zinc-100 placeholder-zinc-600 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors"
              />
              <p className="text-zinc-600 text-xs">
                Las notas largas pasan automáticamente a procesamiento en segundo plano para ahorrar coste.
              </p>
            </>
          ) : (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-amber-600 rounded-xl p-8 text-center cursor-pointer transition-colors"
              >
                <p className="text-3xl mb-3">📄</p>
                {file ? (
                  <p className="text-zinc-300 text-sm">{file.name}</p>
                ) : (
                  <>
                    <p className="text-zinc-400 text-sm">Arrastra o haz clic para subir</p>
                    <p className="text-zinc-600 text-xs mt-1">TXT · DOCX · PDF</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.docx,.pdf,.md"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
              <p className="text-zinc-600 text-xs">
                Si el fichero contiene muchas notas, la ingestión se enviará en segundo plano y podrás revisarla desde el botón Ingestas.
              </p>
            </>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
                {kind === "entity" ? "Añadiendo…" : "Integrando… (puede tardar hasta 1 min)"}
              </>
            ) : (
              kind === "entity" ? "Añadir entidad" : "Integrar notas"
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
