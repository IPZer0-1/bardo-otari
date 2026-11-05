import { vi } from "vitest";

/**
 * Dobles de los SDK de Anthropic y OpenAI. Registran con qué opciones se
 * construye cada cliente y qué payload recibe cada llamada, sin red.
 */
export const anthropicCtor = vi.fn();
export const anthropicCreate = vi.fn();
export const openaiCtor = vi.fn();
export const openaiCreate = vi.fn();

/** Promesa con `.withResponse()`, como la APIPromise de los SDK. */
export function apiPromise<T>(data: T, headers: Record<string, string> = {}) {
  const p = Promise.resolve(data) as Promise<T> & {
    withResponse: () => Promise<{ data: T; response: Response }>;
  };
  p.withResponse = async () => ({ data, response: new Response(null, { headers }) });
  return p;
}

export function anthropicMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    model: "claude-haiku-5-5",
    content: [
      { type: "thinking", thinking: "..." },
      { type: "text", text: "hola" },
    ],
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 2,
    },
    ...overrides,
  };
}

export function openaiCompletion(overrides: Record<string, unknown> = {}) {
  return {
    id: "chatcmpl-1",
    model: "gpt-5.6-luna",
    choices: [{ index: 0, message: { role: "assistant", content: "hola" } }],
    usage: { prompt_tokens: 7, completion_tokens: 4 },
    ...overrides,
  };
}

export function resetSdkMocks() {
  anthropicCtor.mockReset();
  anthropicCreate.mockReset();
  openaiCtor.mockReset();
  openaiCreate.mockReset();
}
