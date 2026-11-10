import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { MODEL_IDS, type LlmProvider } from "./llm-provider";

let _anthropic: Anthropic | undefined;
let _openai: OpenAI | undefined;
const anthropic = () =>
  _anthropic ?? (_anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
const openai = () =>
  _openai ?? (_openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

// Otari (gateway opcional) habla los dos protocolos: usamos los mismos SDK
// apuntando a su URL con su key. El Anthropic SDK añade `/v1/messages` y el
// de OpenAI espera la base con `/v1`.
const OTARI_BASE_URL = process.env.OTARI_BASE_URL || "https://api.otari.ai/api";
let _otariAnthropic: Anthropic | undefined;
let _otariOpenai: OpenAI | undefined;
const otariAnthropic = () =>
  _otariAnthropic ??
  (_otariAnthropic = new Anthropic({ apiKey: process.env.OTARI_API_KEY, baseURL: OTARI_BASE_URL }));
const otariOpenai = () =>
  _otariOpenai ??
  (_otariOpenai = new OpenAI({ apiKey: process.env.OTARI_API_KEY, baseURL: `${OTARI_BASE_URL}/v1` }));

type ChatMessage = { role: "user" | "assistant"; content: string };

export interface LlmCallOptions {
  provider: LlmProvider;
  /** Categoría lógica del modelo. Mapeo concreto en MODEL_IDS. */
  tier: "haiku" | "sonnet" | "summary";
  system: string;
  messages: ChatMessage[];
  /**
   * Tope de tokens generados por la respuesta. En OpenAI cuenta también
   * los tokens de razonamiento — fijamos reasoning_effort=low para
   * minimizar el impacto y dejar holgura al texto.
   */
  maxTokens: number;
  /**
   * Si true y el modelo es de Anthropic, marca el system con cache_control
   * 1h. Ignorado en OpenAI (no expone esa primitiva).
   */
  cacheSystem?: boolean;
  /**
   * Usuario de Bardo que origina la llamada (users.id). Solo lo usa Otari,
   * para aplicar su presupuesto por usuario y atribuirle el coste. Los
   * providers directos no lo reciben.
   */
  endUserId?: string;
  /** Operación lógica (query, ingest…) para etiquetar el coste en Otari. */
  tag?: string;
}

export interface LlmCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /**
   * Modelo usado, para guardar en usage_logs.model. Vía Otari es el que
   * respondió de verdad (`proveedor:modelo`), que con una política de
   * routing puede ser el de fallback.
   */
  model: string;
  /** Solo vía Otari: coste real en USD que reporta el gateway. */
  costUsd?: number;
  /** Solo vía Otari: true si respondió un candidato de fallback. */
  fallback?: boolean;
  /** Solo vía Otari: veredictos de los guardrails (cabecera Otari-Guardrails). */
  guardrails?: GuardrailVerdict[];
}

/**
 * Un guardrail de entrada evaluado por Otari. En modo `monitor` la petición
 * se sirve siempre y el veredicto llega aquí: `valid: false` = marcado.
 */
export interface GuardrailVerdict {
  profile: string;
  mode: "monitor" | "block";
  valid: boolean | null;
  score: number | null;
  status: string;
  reason?: string;
}

/**
 * Otari rechaza con 403 + `Otari-Error-Code: budget_exceeded` cuando se
 * agota un presupuesto (del usuario, del workspace…). Las rutas lo
 * traducen a un mensaje para el jugador.
 */
export class LlmBudgetExceededError extends Error {
  constructor(
    public readonly scope: string | null,
    /** Segundos hasta que se repone el presupuesto (`Retry-After`), si llega. */
    public readonly retryAfterSec: number | null = null,
  ) {
    super(`Presupuesto del gateway agotado${scope ? ` (${scope})` : ""}`);
    this.name = "LlmBudgetExceededError";
  }
}

/**
 * Los modelos Claude 5.x razonan por defecto y ese razonamiento se factura
 * como tokens de salida. Para nuestros usos (chat, JSON de ingesta,
 * selectores) no compensa, así que lo apagamos:
 *   - Haiku 5.5 acepta `disabled` (con effort por defecto, medium).
 *   - Sonnet 5.5 devuelve 400 con `disabled`; el equivalente es
 *     `between_tools`. El SDK 0.88 aún no tiene ese tipo, de ahí el cast.
 * Modelos no listados: no se envía `thinking` (comportamiento del modelo).
 * Acepta también el formato de Otari `anthropic:claude-…`.
 */
export function thinkingConfigFor(
  model: string
): Anthropic.Messages.ThinkingConfigParam | undefined {
  const id = model.replace(/^anthropic:/, "");
  if (id.startsWith("claude-haiku-5")) return { type: "disabled" };
  if (id.startsWith("claude-sonnet-5-5")) {
    return { type: "between_tools" } as unknown as Anthropic.Messages.ThinkingConfigParam;
  }
  return undefined;
}

/** Concatena los bloques de texto (ignora thinking y demás). */
export function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function anthropicSystem(opts: LlmCallOptions) {
  return opts.cacheSystem
    ? [
        {
          type: "text" as const,
          text: opts.system,
          cache_control: { type: "ephemeral", ttl: "1h" } as { type: "ephemeral" },
        },
      ]
    : opts.system;
}

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult> {
  const model = MODEL_IDS[opts.tier][opts.provider];

  if (opts.provider === "otari") return callOtari(opts, model);

  if (opts.provider === "openai") {
    const response = await openai().chat.completions.create({
      model,
      max_completion_tokens: opts.maxTokens,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages,
      ],
    });
    return {
      text: response.choices[0]?.message?.content ?? "",
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      model,
    };
  }

  const thinking = thinkingConfigFor(model);
  const response = await anthropic().messages.create({
    model,
    max_tokens: opts.maxTokens,
    ...(thinking ? { thinking } : {}),
    system: anthropicSystem(opts),
    messages: opts.messages,
  });
  const text = extractText(response.content);
  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    model,
  };
}

// --- Otari ---

/**
 * Cabeceras propias de Otari (no se reenvían al proveedor):
 *   - Otari-Tags: etiqueta de coste visible en Usage/Activity.
 *   - Idempotency-Key: si el SDK reintenta (reusa las mismas opciones),
 *     Otari devuelve la respuesta original sin volver a facturar.
 */
function otariHeaders(opts: LlmCallOptions): Record<string, string> {
  const tags = ["app=bardo", `tier=${opts.tier}`];
  if (opts.tag) tags.push(`op=${encodeURIComponent(opts.tag)}`);
  return { "Otari-Tags": tags.join(","), "Idempotency-Key": randomUUID() };
}

/** Modelo que respondió según Otari, p. ej. `deepinfra:mistral-small-4`. */
function servedModel(headers: Headers, requested: string): string {
  const served = headers.get("otari-model");
  if (!served) return requested;
  const provider = headers.get("otari-provider");
  return provider ? `${provider}:${served}` : served;
}

/** Otari devuelve `cost_usd` como string decimal ("0.000135"); aceptamos ambos. */
function readCostUsd(usage: unknown): number | undefined {
  const cost = (usage as { cost_usd?: unknown } | null | undefined)?.cost_usd;
  const n = typeof cost === "string" ? Number(cost) : cost;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/**
 * Otari solo acepta un usuario final arbitrario (`user` / `metadata.user_id`)
 * con una service key; con una key normal responde 403 "'user' field does
 * not match the authenticated API key's user". Por eso solo se envía si
 * OTARI_SERVICE_KEY=true. Se lee en cada llamada para poder cambiarlo sin
 * recargar el módulo en los tests.
 */
function otariEndUser(opts: LlmCallOptions): string | undefined {
  return process.env.OTARI_SERVICE_KEY === "true" ? opts.endUserId : undefined;
}

/**
 * Algunos modelos abiertos razonan por defecto y ese razonamiento cuenta
 * como salida: con un tope bajo pueden agotarlo y devolver `content` vacío.
 * Medido en Otari (2026-11-09) con un selector de docs:
 *   - Qwen 3.5: solo `none` lo apaga (800 tokens sin respuesta → 12).
 *   - gpt-oss-20b/120b: `none` lo reduce (215 → 75; 254 → 65).
 *   - Mistral Small 4: no razona sin parámetro, pero `low` lo *activa*
 *     (agota 600 tokens), así que no vale un `low` genérico.
 *   - DeepSeek v4.1 flash, Llama 3.3, Gemma 4: aceptan `none` sin cambios.
 * Por eso se envía `none` siempre, también a las políticas de routing,
 * cuyo modelo real no se conoce hasta la respuesta.
 * OTARI_REASONING_EFFORT cambia el valor; `omit` no envía el parámetro.
 */
export function otariReasoningEffort(): OpenAI.ReasoningEffort | undefined {
  const raw = process.env.OTARI_REASONING_EFFORT?.trim();
  if (raw === "omit") return undefined;
  return (raw || "none") as OpenAI.ReasoningEffort;
}

/** Lee `Otari-Guardrails` (JSON); si falta o no se entiende, undefined. */
export function readGuardrails(headers: Headers): GuardrailVerdict[] | undefined {
  const raw = headers.get("otari-guardrails");
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GuardrailVerdict[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Resumen para el log: solo lo marcado o lo que no se pudo evaluar. */
function guardrailLog(verdicts: GuardrailVerdict[] | undefined): string {
  const notable = (verdicts ?? []).filter((v) => v.valid === false || v.status === "unavailable");
  return notable
    .map((v) =>
      v.valid === false
        ? ` GUARDRAIL:${v.profile}=marcado${v.score != null ? `(${v.score})` : ""}`
        : ` guardrail:${v.profile}=no-evaluado(${v.reason ?? "?"})`
    )
    .join("");
}

function toBudgetError(err: unknown): LlmBudgetExceededError | null {
  const e = err as { status?: number; headers?: Headers | Record<string, string> } | null;
  if (!e || e.status !== 403 || !e.headers) return null;
  const get = (name: string) =>
    typeof (e.headers as Headers).get === "function"
      ? (e.headers as Headers).get(name)
      : ((e.headers as Record<string, string>)[name] ?? null);
  if (get("otari-error-code") !== "budget_exceeded") return null;
  const retry = Number.parseInt(get("retry-after") ?? "", 10);
  return new LlmBudgetExceededError(
    get("otari-budget-scope"),
    Number.isFinite(retry) && retry >= 0 ? retry : null,
  );
}

async function callOtari(opts: LlmCallOptions, model: string): Promise<LlmCallResult> {
  try {
    const result = model.startsWith("anthropic:")
      ? await callOtariMessages(opts, model)
      : await callOtariChat(opts, model);
    const cost = result.costUsd !== undefined ? `$${result.costUsd.toFixed(5)}` : "?";
    console.log(
      `[otari] op=${opts.tag ?? "-"} pedido=${model} servido=${result.model}` +
        ` tokens=${result.inputTokens}+${result.outputTokens} coste=${cost}` +
        (result.fallback ? " FALLBACK" : "") +
        guardrailLog(result.guardrails)
    );
    return result;
  } catch (err) {
    throw toBudgetError(err) ?? err;
  }
}

/** Claude vía Otari por la ruta Messages: conserva thinking y caché. */
async function callOtariMessages(opts: LlmCallOptions, model: string): Promise<LlmCallResult> {
  const thinking = thinkingConfigFor(model);
  const endUser = otariEndUser(opts);
  const { data, response } = await otariAnthropic()
    .messages.create(
      {
        model,
        max_tokens: opts.maxTokens,
        ...(thinking ? { thinking } : {}),
        system: anthropicSystem(opts),
        messages: opts.messages,
        ...(endUser ? { metadata: { user_id: endUser } } : {}),
      },
      { headers: otariHeaders(opts) }
    )
    .withResponse();
  return {
    text: extractText(data.content),
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    cacheCreationTokens: data.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: data.usage.cache_read_input_tokens ?? 0,
    model: servedModel(response.headers, model),
    costUsd: readCostUsd(data.usage),
    fallback: response.headers.get("otari-fallback") === "true",
    guardrails: readGuardrails(response.headers),
  };
}

/** Resto de modelos (abiertos, políticas de routing) por la ruta OpenAI. */
async function callOtariChat(opts: LlmCallOptions, model: string): Promise<LlmCallResult> {
  const endUser = otariEndUser(opts);
  const effort = otariReasoningEffort();
  const { data, response } = await otariOpenai()
    .chat.completions.create(
      {
        model,
        max_completion_tokens: opts.maxTokens,
        ...(effort ? { reasoning_effort: effort } : {}),
        messages: [{ role: "system", content: opts.system }, ...opts.messages],
        ...(endUser ? { user: endUser } : {}),
      },
      { headers: otariHeaders(opts) }
    )
    .withResponse();
  const cached =
    (data.usage as { prompt_tokens_details?: { cached_tokens?: number } } | undefined)
      ?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    text: data.choices[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    cacheCreationTokens: 0,
    cacheReadTokens: cached,
    model: servedModel(response.headers, model),
    costUsd: readCostUsd(data.usage),
    fallback: response.headers.get("otari-fallback") === "true",
    guardrails: readGuardrails(response.headers),
  };
}
