import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { MODEL_IDS, type LlmProvider } from "./llm-provider";

let _anthropic: Anthropic | undefined;
let _openai: OpenAI | undefined;
const anthropic = () =>
  _anthropic ?? (_anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
const openai = () =>
  _openai ?? (_openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

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
   * Si true y provider=anthropic, marca el system con cache_control 1h.
   * Ignorado en OpenAI (no expone esa primitiva).
   */
  cacheSystem?: boolean;
}

export interface LlmCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** ID concreto del modelo usado, para guardar en usage_logs.model. */
  model: string;
}

/**
 * Los modelos Claude 5.x razonan por defecto y ese razonamiento se factura
 * como tokens de salida. Para nuestros usos (chat, JSON de ingesta,
 * selectores) no compensa, así que lo apagamos:
 *   - Haiku 5.5 acepta `disabled` (con effort por defecto, medium).
 *   - Sonnet 5.5 devuelve 400 con `disabled`; el equivalente es
 *     `between_tools`. El SDK 0.88 aún no tiene ese tipo, de ahí el cast.
 * Modelos no listados: no se envía `thinking` (comportamiento del modelo).
 */
export function thinkingConfigFor(
  model: string
): Anthropic.Messages.ThinkingConfigParam | undefined {
  if (model.startsWith("claude-haiku-5")) return { type: "disabled" };
  if (model.startsWith("claude-sonnet-5-5")) {
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

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult> {
  const model = MODEL_IDS[opts.tier][opts.provider];

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
    system: opts.cacheSystem
      ? [
          {
            type: "text",
            text: opts.system,
            cache_control: { type: "ephemeral", ttl: "1h" } as { type: "ephemeral" },
          },
        ]
      : opts.system,
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
