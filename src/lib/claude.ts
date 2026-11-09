import Anthropic from "@anthropic-ai/sdk";
import type { CampaignDoc } from "@/db/docs";
import { callLlm, extractText, thinkingConfigFor } from "./llm-call";
import { MODEL_IDS, type LlmProvider } from "./llm-provider";

let _client: Anthropic | undefined;
const client = () =>
  _client ?? (_client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

// Docs que siempre se incluyen independientemente de la pregunta.
// Son el hilo conductor de la campaña y casi siempre aportan contexto.
const ANCHOR_DOCS = ["campaign/sesiones.md", "campaign/hilos-trama.md"];

// Construye el bloque de sistema con los MDs seleccionados.
export function buildSystemPrompt(docs: CampaignDoc[]): string {
  if (docs.length === 0) return "";

  const sections = docs
    .map((d) => `## ${d.file_path}\n\n${d.content}`)
    .join("\n\n---\n\n");

  return `Eres el asistente de una campaña de rol. Tu función es responder preguntas sobre los hechos, personajes, hilos de trama y lore de la campaña, basándote EXCLUSIVAMENTE en la documentación que se te proporciona a continuación.

Reglas:
- Responde siempre en el idioma que te pregunten.
- Si la información no está en los documentos, dilo explícitamente: "No tengo información sobre eso en la campaña."
- Si existe una discrepancia registrada entre versiones de distintos jugadores, indícalo con claridad: "Hay versiones distintas sobre este punto: [jugador A] anotó X, [jugador B] anotó Y."
- No inventes ni extrapoles más allá de lo documentado.
- Sé conciso pero completo. Cita el contexto relevante cuando ayude.
- Nunca pidas al usuario que te proporcione más información. Tu única fuente es la documentación de la campaña. Si algo no está documentado, indícalo y punto.

---

# Documentación de la campaña

${sections}`;
}

// Selecciona los docs relevantes para una pregunta usando un modelo barato
// como clasificador. Siempre incluye los ANCHOR_DOCS. Si falla, devuelve
// null → el llamador hace fallback a todos los docs.
export async function selectRelevantDocs(
  docs: CampaignDoc[],
  question: string,
  provider: LlmProvider
): Promise<CampaignDoc[] | null> {
  // Con pocos docs no vale la pena clasificar
  if (docs.length <= 4) return docs;

  const index = docs
    .map((d) => `- ${d.file_path}: ${d.content.slice(0, 150).replace(/\n/g, " ")}`)
    .join("\n");

  const prompt = `Tienes estos documentos de una campaña de rol:
${index}

Pregunta del usuario: "${question}"

Devuelve SOLO un array JSON con los file_paths de los documentos necesarios para responder esa pregunta. Incluye siempre: ${ANCHOR_DOCS.map((p) => `"${p}"`).join(", ")}. Selecciona entre 2 y 6 documentos en total. Sin texto adicional.`;

  try {
    const response = await callLlm({
      provider,
      tier: "summary",
      system: "",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 256,
    });

    const match = response.text.match(/\[[\s\S]*\]/);
    if (!match) return null;

    const selected: string[] = JSON.parse(match[0]);
    const paths = new Set([...ANCHOR_DOCS, ...selected]);
    const filtered = docs.filter((d) => paths.has(d.file_path));

    return filtered.length > 0 ? filtered : null;
  } catch {
    return null;
  }
}

// Anchors para ingesta de sesión: docs que casi siempre se actualizan.
// Para correction NO se usan — la nota suele tocar un único doc.
const INGEST_SESSION_ANCHOR_DOCS = ["campaign/sesiones.md", "campaign/hilos-trama.md"];

export interface IngestRouterResult {
  /** Subset de docs que el router considera relevantes para esta nota. */
  docs: CampaignDoc[];
  /** Tokens consumidos por la llamada del router (para sumar al log). */
  routerInputTokens: number;
  routerOutputTokens: number;
  /** Modelo concreto que ejecutó el router. */
  routerModel: string;
}

/**
 * Selecciona los docs candidatos a ser modificados por una ingesta.
 * Espejo de selectRelevantDocs pero adaptado: el "input" es la nota a
 * integrar, no una pregunta. Usa el tier "summary" (ver MODEL_IDS).
 *
 * El segundo pase de ingesta puede crear archivos NUEVOS aunque no estén
 * en la selección — el router solo restringe el contexto de LECTURA.
 *
 * Devuelve null si no merece la pena filtrar (pocos docs) o si el router
 * falla (JSON inválido / error API). Caller hace fallback a todos los docs.
 */
export async function selectRelevantDocsForIngest(
  docs: CampaignDoc[],
  notes: string,
  provider: LlmProvider,
  opts?: { anchors?: string[] }
): Promise<IngestRouterResult | null> {
  if (docs.length <= 3) return null;

  const anchors = opts?.anchors ?? [];
  const index = docs
    .map((d) => `- ${d.file_path}: ${d.content.slice(0, 150).replace(/\n/g, " ")}`)
    .join("\n");

  const anchorsClause =
    anchors.length > 0
      ? `Incluye SIEMPRE estos paths en la respuesta: ${anchors.map((p) => `"${p}"`).join(", ")}.`
      : "";

  const prompt = `Tienes el índice de documentos de una campaña de rol:
${index}

Nota nueva a integrar en la documentación:
"""
${notes.slice(0, 2000)}
"""

Devuelve SOLO un array JSON con los file_paths de los documentos existentes que probablemente necesiten ser leídos o modificados para integrar esta nota. ${anchorsClause} No inventes paths nuevos — si la nota requiere un documento que no existe, el modelo principal lo creará después. Sin texto adicional.`;

  try {
    const response = await callLlm({
      provider,
      tier: "summary",
      system: "",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 256,
    });

    const match = response.text.match(/\[[\s\S]*\]/);
    if (!match) return null;

    const selected: string[] = JSON.parse(match[0]);
    const paths = new Set([...anchors, ...selected]);
    const filtered = docs.filter((d) => paths.has(d.file_path));

    if (filtered.length === 0) return null;

    return {
      docs: filtered,
      routerInputTokens: response.inputTokens,
      routerOutputTokens: response.outputTokens,
      routerModel: response.model,
    };
  } catch {
    return null;
  }
}

// --- Diff-based ingestion types ---
// Claude devuelve operaciones granulares en vez de docs completos.
// Esto reduce tokens de output un ~70-80%.
export interface DocPatch {
  file_path: string;
  action: "append" | "replace_section" | "create";
  /** Para append: texto a añadir al final del doc */
  /** Para replace_section: heading de la sección a reemplazar */
  section?: string;
  content: string;
}

/** Formato legacy — se mantiene para compatibilidad con el caller */
export interface DocUpdate {
  file_path: string;
  content: string;
}

export interface ConflictItem {
  file_path: string;
  description: string;
  version_a: string;
  version_b: string;
}

export interface IngestResult {
  model: string;
  updates: DocUpdate[];
  conflicts: ConflictItem[];
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}

/**
 * Aplica un patch sobre el contenido existente de un doc.
 * - append: añade content al final
 * - replace_section: busca el heading `section` y reemplaza hasta el siguiente heading del mismo nivel
 * - create: devuelve content directamente (doc nuevo)
 */
export function applyPatch(existing: string | null, patch: DocPatch): string {
  if (patch.action === "create" || !existing) {
    return patch.content;
  }

  if (patch.action === "append") {
    return existing.trimEnd() + "\n\n" + patch.content;
  }

  // replace_section: buscar el heading y reemplazar hasta el siguiente del mismo nivel o superior
  if (patch.action === "replace_section" && patch.section) {
    const heading = patch.section;
    // Detectar nivel del heading (# = 1, ## = 2, etc.)
    const levelMatch = heading.match(/^(#{1,6})\s/);
    const level = levelMatch ? levelMatch[1].length : 2;

    const lines = existing.split("\n");
    const startIdx = lines.findIndex((l) => l.trim() === heading.trim());

    if (startIdx === -1) {
      // Heading no encontrado — append como fallback seguro
      return existing.trimEnd() + "\n\n" + patch.content;
    }

    // Buscar el final de la sección (siguiente heading de nivel <= level)
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s/);
      if (m && m[1].length <= level) {
        endIdx = i;
        break;
      }
    }

    const before = lines.slice(0, startIdx).join("\n");
    const after = lines.slice(endIdx).join("\n");
    return (before.trimEnd() + "\n\n" + patch.content + "\n\n" + after.trimStart()).trim();
  }

  return existing;
}

// --- Prompts de ingestión (compartidos entre sync y batch) ---

function buildIngestSystemPrompt(docs: CampaignDoc[]): string {
  const existingDocs =
    docs.length > 0
      ? docs.map((d) => `## ${d.file_path}\n\n${d.content}`).join("\n\n---\n\n")
      : "(Sin documentación previa — crea los documentos que consideres necesarios)";

  return `Eres el asistente de una campaña de rol. Tu tarea es integrar notas nuevas de sesión en la documentación existente de la campaña.

Documentación actual de la campaña:

${existingDocs}`;
}

export interface IngestPromptMetadata {
  session?: string | null;
  entities?: string[];
}

function buildMetadataBlock(metadata?: IngestPromptMetadata): string {
  if (!metadata) return "";
  const lines: string[] = [];
  if (metadata.session) lines.push(`- Sesión detectada: ${metadata.session}`);
  if (metadata.entities && metadata.entities.length > 0) {
    lines.push(`- Entidades del catálogo mencionadas en la nota: ${metadata.entities.join(", ")}`);
  }
  if (lines.length === 0) return "";
  return `Contexto pre-detectado por reglas deterministas (ya verificado, úsalo para situar la nota):
${lines.join("\n")}

`;
}

function buildIngestUserPrompt(notes: string, metadata?: IngestPromptMetadata): string {
  return `${buildMetadataBlock(metadata)}Aquí están las notas nuevas de sesión:

---
${notes}
---

Integra esta información en la documentación existente siguiendo estas reglas:

1. Añade información nueva a los documentos existentes donde corresponda.
2. No elimines ni sobreescribas información ya establecida salvo que las notas la corrijan explícitamente.
3. Si las notas contradicen algo ya documentado, NO modifiques el documento — registra el conflicto. Excepción: los cambios de estado (ej. "isla no visitada" → "visitada", "PNJ desconocido" → "aliado") son actualizaciones legítimas, no conflictos — aplícalos directamente.
4. Mantén SIEMPRE un archivo llamado "sesiones.md" con el registro cronológico de sesiones. Cada sesión debe tener: fecha (si se menciona, o "Sesión N" si no), y un resumen de 3-6 líneas de lo que ocurrió. Las sesiones más recientes van al principio del archivo. Si "sesiones.md" ya existe, añade la nueva sesión al principio sin modificar las anteriores.
5. IMPORTANTE — para ahorrar tokens, NO devuelvas documentos completos. Devuelve SOLO las operaciones necesarias usando este formato:

{
  "patches": [
    {
      "file_path": "nombre-del-archivo.md",
      "action": "append",
      "content": "texto a añadir al final del documento"
    },
    {
      "file_path": "nombre-del-archivo.md",
      "action": "replace_section",
      "section": "## Heading exacto de la sección",
      "content": "contenido completo de la sección reemplazada (incluyendo el heading)"
    },
    {
      "file_path": "nuevo-archivo.md",
      "action": "create",
      "content": "contenido completo del nuevo archivo"
    }
  ],
  "conflicts": [
    {
      "file_path": "nombre-del-archivo.md",
      "description": "descripción breve del conflicto",
      "version_a": "lo que dice la documentación actual",
      "version_b": "lo que dicen las notas nuevas"
    }
  ]
}

Acciones disponibles:
- "append": añade contenido al final de un archivo existente. Usa esto para la mayoría de cambios.
- "replace_section": reemplaza una sección específica identificada por su heading exacto. Usa esto para actualizar datos concretos (ej. estado de un PNJ, progreso de un hilo).
- "create": crea un archivo nuevo. Solo cuando no existe uno apropiado.

Reglas clave:
- Devuelve SOLO lo que cambia. Un append de 3 líneas es mejor que un documento completo de 200.
- Para sesiones.md, usa replace_section con la sección "# Sesiones" si necesitas insertar al principio, o append si solo añades al final.
- No incluyas archivos que no cambian.`;
}

/**
 * Parsea la respuesta de Claude (patches JSON) y aplica sobre los docs existentes.
 */
function parseIngestResponse(
  raw: string,
  docs: CampaignDoc[]
): { updates: DocUpdate[]; conflicts: ConflictItem[] } {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude no devolvió JSON válido");

  const parsed = JSON.parse(jsonMatch[0]) as {
    patches?: DocPatch[];
    conflicts?: ConflictItem[];
  };

  const docsMap = new Map(docs.map((d) => [d.file_path, d.content]));
  const updates: DocUpdate[] = [];

  for (const patch of parsed.patches ?? []) {
    const existing = docsMap.get(patch.file_path) ?? null;
    const newContent = applyPatch(existing, patch);
    updates.push({ file_path: patch.file_path, content: newContent });
    docsMap.set(patch.file_path, newContent);
  }

  return {
    updates,
    conflicts: parsed.conflicts ?? [],
  };
}

// Umbrales para usar Haiku en vez de Sonnet para ingestión.
// Notas cortas + pocos docs = ingestión simple → Haiku (75% más barato).
const HAIKU_INGEST_MAX_NOTES_WORDS = 500;
const HAIKU_INGEST_MAX_DOCS = 5;

export function shouldIngestUseHaiku(docs: CampaignDoc[], notes: string): boolean {
  const wordCount = notes.split(/\s+/).length;
  return wordCount <= HAIKU_INGEST_MAX_NOTES_WORDS && docs.length <= HAIKU_INGEST_MAX_DOCS;
}

export async function ingestNotes(
  docs: CampaignDoc[],
  notes: string,
  metadata?: IngestPromptMetadata,
  provider: LlmProvider = "anthropic"
): Promise<IngestResult> {
  const router = await selectRelevantDocsForIngest(docs, notes, provider, {
    anchors: INGEST_SESSION_ANCHOR_DOCS,
  });
  const docsForPrompt = router?.docs ?? docs;
  if (router) {
    console.log(
      `[ingest] router ${router.routerModel} seleccionó ${router.docs.length}/${docs.length} docs ` +
        `(${router.routerInputTokens}+${router.routerOutputTokens} tok): ` +
        router.docs.map((d) => d.file_path).join(", ")
    );
  } else if (docs.length > 3) {
    console.log(`[ingest] router no aplicado o falló — usando todos los docs (${docs.length})`);
  }

  const systemPrompt = buildIngestSystemPrompt(docsForPrompt);
  const userPrompt = buildIngestUserPrompt(notes, metadata);

  // Tier según el tamaño de las notas. Ambos slots se enrutan por callLlm,
  // así que respetan el provider del toggle / DEFAULT_PROVIDER.
  const tier = shouldIngestUseHaiku(docsForPrompt, notes) ? "haiku" : "sonnet";
  const response = await callLlm({
    provider,
    tier,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 8000,
  });
  const result = parseIngestResponse(response.text || "{}", docs);
  return {
    model: response.model,
    ...result,
    input_tokens: response.inputTokens + (router?.routerInputTokens ?? 0),
    output_tokens: response.outputTokens + (router?.routerOutputTokens ?? 0),
    cache_creation_tokens: response.cacheCreationTokens,
    cache_read_tokens: response.cacheReadTokens,
  };
}

// --- Ruta "correction" (medida c) ---
// Cambios puntuales sobre la doc (un dato concreto). Usa Haiku 4.5 con
// un prompt minimalista que asume que la nota es una corrección y no una
// crónica completa. Reutiliza buildIngestSystemPrompt para tener los docs
// como contexto, pero el user prompt es muy corto y no enumera reglas.
function buildCorrectionUserPrompt(notes: string, metadata?: IngestPromptMetadata): string {
  return `${buildMetadataBlock(metadata)}Esta es una corrección puntual sobre la documentación de la campaña. Aplica el cambio mínimo necesario y devuelve solo los patches afectados en el siguiente formato JSON:

{
  "patches": [
    { "file_path": "...", "action": "replace_section" | "append" | "create", "section": "## Heading exacto", "content": "..." }
  ],
  "conflicts": []
}

Si la corrección contradice algo establecido, regístralo en "conflicts" en vez de aplicarlo.

Corrección:
---
${notes}
---`;
}

export async function ingestCorrection(
  docs: CampaignDoc[],
  notes: string,
  metadata?: IngestPromptMetadata,
  provider: LlmProvider = "anthropic"
): Promise<IngestResult> {
  const router = await selectRelevantDocsForIngest(docs, notes, provider);
  const docsForPrompt = router?.docs ?? docs;
  if (router) {
    console.log(
      `[ingest_correction] router ${router.routerModel} seleccionó ${router.docs.length}/${docs.length} docs ` +
        `(${router.routerInputTokens}+${router.routerOutputTokens} tok): ` +
        router.docs.map((d) => d.file_path).join(", ")
    );
  } else if (docs.length > 3) {
    console.log(`[ingest_correction] router no aplicado o falló — usando todos los docs (${docs.length})`);
  }

  const systemPrompt = buildIngestSystemPrompt(docsForPrompt);
  const userPrompt = buildCorrectionUserPrompt(notes, metadata);

  const response = await callLlm({
    provider,
    tier: "haiku",
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 2000,
  });

  // parseIngestResponse necesita la lista COMPLETA de docs para aplicar
  // patches sobre paths que el router pudo haber excluido (poco probable
  // si el modelo respeta la selección, pero defensivo).
  const result = parseIngestResponse(response.text || "{}", docs);

  return {
    model: response.model,
    ...result,
    input_tokens: response.inputTokens + (router?.routerInputTokens ?? 0),
    output_tokens: response.outputTokens + (router?.routerOutputTokens ?? 0),
    cache_creation_tokens: response.cacheCreationTokens,
    cache_read_tokens: response.cacheReadTokens,
  };
}

// --- Batch API para ingestión (50% descuento) ---

export interface BatchIngestRequest {
  batchId: string;
  customId: string;
}

/**
 * Envía la ingestión como un batch request (50% más barato).
 * No devuelve resultado inmediato — hay que poll con checkBatchIngest.
 */
export async function startBatchIngest(
  docs: CampaignDoc[],
  notes: string,
  metadata?: IngestPromptMetadata
): Promise<BatchIngestRequest> {
  const systemPrompt = buildIngestSystemPrompt(docs);
  const userPrompt = buildIngestUserPrompt(notes, metadata);
  const customId = `ingest-${Date.now()}`;
  const batchThinking = thinkingConfigFor(MODEL_IDS.sonnet.anthropic);

  const batch = await client().messages.batches.create({
    requests: [
      {
        custom_id: customId,
        params: {
          model: MODEL_IDS.sonnet.anthropic,
          max_tokens: 8000,
          ...(batchThinking ? { thinking: batchThinking } : {}),
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        },
      },
    ],
  });

  return { batchId: batch.id, customId };
}

/**
 * Comprueba el estado de un batch de ingestión.
 * Devuelve null si aún está procesando, o el resultado si ya terminó.
 */
export async function checkBatchIngest(
  batchId: string,
  customId: string,
  docs: CampaignDoc[]
): Promise<{ status: "processing" | "done" | "failed"; result?: IngestResult }> {
  const batch = await client().messages.batches.retrieve(batchId);

  if (batch.processing_status === "in_progress") {
    return { status: "processing" };
  }

  if (batch.processing_status !== "ended") {
    return { status: "failed" };
  }

  // Leer resultados del batch — results() devuelve Promise<JSONLDecoder>,
  // que es async-iterable tras el await
  const decoder = await client().messages.batches.results(batchId);
  const results: Anthropic.Messages.MessageBatchIndividualResponse[] = [];
  for await (const item of decoder) {
    results.push(item);
  }

  const match = results.find((r) => r.custom_id === customId);
  if (!match || match.result.type !== "succeeded") {
    return { status: "failed" };
  }

  const response = match.result.message;
  const raw = extractText(response.content) || "{}";

  try {
    const result = parseIngestResponse(raw, docs);
    return {
      status: "done",
      result: {
        model: response.model,
        ...result,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
        cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  } catch {
    return { status: "failed" };
  }
}

// --- Resumen progresivo de historial ---
// En vez de enviar 10 mensajes completos, resume los antiguos con Haiku
// y envía resumen + últimos RECENT_MESSAGES_COUNT mensajes.
const SUMMARY_THRESHOLD = 6; // A partir de 6 mensajes, resumir los antiguos
const RECENT_MESSAGES_COUNT = 4; // Mensajes recientes que se envían completos

async function summarizeHistory(
  messages: { role: "user" | "assistant"; content: string }[],
  provider: LlmProvider
): Promise<string> {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "Jugador" : "Asistente"}: ${m.content}`)
    .join("\n\n");

  const response = await callLlm({
    provider,
    tier: "summary",
    system: "",
    messages: [
      {
        role: "user",
        content: `Resume esta conversación sobre una campaña de rol en 2-3 frases. Captura las preguntas clave y la información proporcionada:\n\n${transcript}`,
      },
    ],
    maxTokens: 300,
  });

  return response.text;
}

/**
 * Prepara el historial: si hay muchos mensajes, resume los antiguos
 * y mantiene los recientes completos.
 */
export async function prepareHistory(
  messages: { role: "user" | "assistant"; content: string }[],
  provider: LlmProvider
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  if (messages.length <= SUMMARY_THRESHOLD) {
    return messages;
  }

  const oldMessages = messages.slice(0, -RECENT_MESSAGES_COUNT);
  const recentMessages = messages.slice(-RECENT_MESSAGES_COUNT);

  const summary = await summarizeHistory(oldMessages, provider);

  return [
    { role: "user", content: `[Resumen de la conversación anterior: ${summary}]` },
    { role: "assistant", content: "Entendido, tengo el contexto previo." },
    ...recentMessages,
  ];
}

export interface QueryResult {
  answer: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  model: string;
}

export async function queryCampaign(
  docs: CampaignDoc[],
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  provider: LlmProvider = "anthropic"
): Promise<QueryResult> {
  // Sin docs: respuesta directa sin llamar al modelo
  if (docs.length === 0) {
    return {
      answer:
        "Esta campaña todavía no tiene documentación. El creador o un master puede importar notas desde el panel de subida.",
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      model: "none",
    };
  }

  const selectedDocs = (await selectRelevantDocs(docs, question, provider)) ?? docs;
  const systemPrompt = buildSystemPrompt(selectedDocs);
  const preparedHistory = await prepareHistory(history, provider);

  const response = await callLlm({
    provider,
    tier: "haiku",
    system: systemPrompt,
    messages: [...preparedHistory, { role: "user", content: question }],
    maxTokens: 2048,
    cacheSystem: true,
  });

  return {
    answer: response.text,
    input_tokens: response.inputTokens,
    output_tokens: response.outputTokens,
    cache_creation_tokens: response.cacheCreationTokens,
    cache_read_tokens: response.cacheReadTokens,
    model: response.model,
  };
}
