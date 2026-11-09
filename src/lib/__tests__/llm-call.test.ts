import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  anthropicCreate,
  anthropicCtor,
  anthropicMessage,
  apiPromise,
  openaiCompletion,
  openaiCreate,
  openaiCtor,
  resetSdkMocks,
} from "./sdk-mocks";

const anthropicClientOf: unknown[] = [];
const openaiClientOf: unknown[] = [];

// Antes de importar los módulos: MODEL_IDS y la base URL se leen al cargar.
process.env.OTARI_API_KEY = "otk_test";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
process.env.OPENAI_API_KEY = "sk-test";

// Cada llamada anota con qué opciones se construyó el cliente que la hizo
// (así distinguimos el cliente directo del de Otari por su baseURL).
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages: { create: (...args: unknown[]) => unknown };
    constructor(opts: unknown) {
      anthropicCtor(opts);
      this.messages = {
        create: (...args: unknown[]) => {
          anthropicClientOf.push(opts);
          return anthropicCreate(...args);
        },
      };
    }
  },
}));
vi.mock("openai", () => ({
  default: class {
    chat: { completions: { create: (...args: unknown[]) => unknown } };
    constructor(opts: unknown) {
      openaiCtor(opts);
      this.chat = {
        completions: {
          create: (...args: unknown[]) => {
            openaiClientOf.push(opts);
            return openaiCreate(...args);
          },
        },
      };
    }
  },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/db/app-settings", () => ({ getAppSetting: vi.fn() }));

const { callLlm, LlmBudgetExceededError, otariReasoningEffort, readGuardrails } = await import("../llm-call");
const { isValidProvider, MODEL_IDS, DEFAULT_PROVIDER } = await import("../llm-provider");
// Algunos tests fuerzan un modelo anthropic:* en el tier sonnet; se restaura en beforeEach.
const defaultOtariModels = [MODEL_IDS.haiku.otari, MODEL_IDS.sonnet.otari, MODEL_IDS.summary.otari];
const defaultSonnetOtari = MODEL_IDS.sonnet.otari;

const base = {
  system: "SYS",
  messages: [{ role: "user" as const, content: "¿Quién es Celeus?" }],
  maxTokens: 100,
};

beforeEach(() => {
  resetSdkMocks();
  delete process.env.OTARI_SERVICE_KEY;
  (MODEL_IDS.sonnet as { otari: string }).otari = defaultSonnetOtari;
  anthropicClientOf.length = 0;
  openaiClientOf.length = 0;
  anthropicCreate.mockImplementation(() => apiPromise(anthropicMessage()));
  openaiCreate.mockImplementation(() => apiPromise(openaiCompletion()));
});

describe("callLlm · anthropic directo (regresión)", () => {
  it("envía el mismo payload que antes de Otari", async () => {
    await callLlm({ ...base, provider: "anthropic", tier: "haiku" });
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(anthropicCreate.mock.calls[0]).toEqual([
      {
        model: "claude-haiku-5-5",
        max_tokens: 100,
        thinking: { type: "disabled" },
        system: "SYS",
        messages: base.messages,
      },
    ]);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("marca el system con cache_control 1h si cacheSystem", async () => {
    await callLlm({ ...base, provider: "anthropic", tier: "haiku", cacheSystem: true });
    expect(anthropicCreate.mock.calls[0][0].system).toEqual([
      { type: "text", text: "SYS", cache_control: { type: "ephemeral", ttl: "1h" } },
    ]);
  });

  it("devuelve texto, tokens y modelo", async () => {
    const r = await callLlm({ ...base, provider: "anthropic", tier: "summary" });
    expect(r).toEqual({
      text: "hola",
      inputTokens: 10,
      outputTokens: 5,
      cacheCreationTokens: 3,
      cacheReadTokens: 2,
      model: "claude-haiku-5-5",
    });
  });
});

describe("callLlm · openai directo (regresión)", () => {
  it("envía el mismo payload que antes de Otari", async () => {
    await callLlm({ ...base, provider: "openai", tier: "haiku" });
    expect(openaiCreate.mock.calls[0]).toEqual([
      {
        model: "gpt-5.6-luna",
        max_completion_tokens: 100,
        reasoning_effort: "low",
        messages: [{ role: "system", content: "SYS" }, ...base.messages],
      },
    ]);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("devuelve texto, tokens y modelo", async () => {
    const r = await callLlm({ ...base, provider: "openai", tier: "sonnet" });
    expect(r).toEqual({
      text: "hola",
      inputTokens: 7,
      outputTokens: 4,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      model: "gpt-5.6-luna",
    });
  });
});

describe("callLlm · directo no envía nada de Otari", () => {
  it("anthropic usa su key y no la URL de Otari", async () => {
    await callLlm({ ...base, provider: "anthropic", tier: "haiku", endUserId: "u1", tag: "query" });
    expect(anthropicClientOf[0]).toEqual({ apiKey: "sk-ant-test" });
    expect(anthropicCreate.mock.calls[0]).toHaveLength(1); // sin cabeceras extra
    expect(anthropicCreate.mock.calls[0][0]).not.toHaveProperty("metadata");
  });

  it("openai usa su key y no recibe el usuario", async () => {
    await callLlm({ ...base, provider: "openai", tier: "haiku", endUserId: "u1", tag: "query" });
    expect(openaiClientOf[0]).toEqual({ apiKey: "sk-test" });
    expect(openaiCreate.mock.calls[0]).toHaveLength(1);
    expect(openaiCreate.mock.calls[0][0]).not.toHaveProperty("user");
  });
});

describe("callLlm · otari", () => {
  it("modelos abiertos van por la ruta OpenAI de Otari con usuario y etiquetas", async () => {
    process.env.OTARI_SERVICE_KEY = "true";
    openaiCreate.mockImplementation(() =>
      apiPromise(
        openaiCompletion({
          usage: { prompt_tokens: 7, completion_tokens: 4, cost_usd: "0.0012" },
        }),
        { "Otari-Provider": "deepinfra", "Otari-Model": "mistral-small-4", "Otari-Fallback": "false" }
      )
    );
    const r = await callLlm({
      ...base,
      provider: "otari",
      tier: "haiku",
      endUserId: "user-uuid",
      tag: "query",
    });

    expect(openaiClientOf[0]).toEqual({
      apiKey: "otk_test",
      baseURL: "https://api.otari.ai/api/v1",
    });
    const [body, reqOpts] = openaiCreate.mock.calls[0];
    expect(body).toEqual({
      model: MODEL_IDS.haiku.otari,
      max_completion_tokens: 100,
      reasoning_effort: "none",
      messages: [{ role: "system", content: "SYS" }, ...base.messages],
      user: "user-uuid",
    });
    expect(reqOpts.headers["Otari-Tags"]).toBe("app=bardo,tier=haiku,op=query");
    expect(reqOpts.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(r).toMatchObject({
      text: "hola",
      model: "deepinfra:mistral-small-4",
      costUsd: 0.0012,
      fallback: false,
    });
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("modelos anthropic:* van por la ruta Messages conservando thinking y caché", async () => {
    anthropicCreate.mockImplementation(() =>
      apiPromise(anthropicMessage(), {
        "Otari-Provider": "anthropic",
        "Otari-Model": "claude-haiku-5-5",
        "Otari-Fallback": "true",
      })
    );
    process.env.OTARI_SERVICE_KEY = "true";
    (MODEL_IDS.sonnet as { otari: string }).otari = "anthropic:claude-haiku-5-5";
    const r = await callLlm({
      ...base,
      provider: "otari",
      tier: "sonnet",
      cacheSystem: true,
      endUserId: "user-uuid",
      tag: "ingest_long",
    });

    expect(anthropicClientOf[0]).toEqual({ apiKey: "otk_test", baseURL: "https://api.otari.ai/api" });
    const [body, reqOpts] = anthropicCreate.mock.calls[0];
    expect(body).toEqual({
      model: "anthropic:claude-haiku-5-5",
      max_tokens: 100,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: "SYS", cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: base.messages,
      metadata: { user_id: "user-uuid" },
    });
    expect(reqOpts.headers["Otari-Tags"]).toBe("app=bardo,tier=sonnet,op=ingest_long");
    expect(r).toMatchObject({
      text: "hola",
      cacheCreationTokens: 3,
      cacheReadTokens: 2,
      model: "anthropic:claude-haiku-5-5",
      fallback: true,
    });
  });

  it("sin cabeceras de Otari se registra el modelo pedido", async () => {
    const r = await callLlm({ ...base, provider: "otari", tier: "summary" });
    expect(r.model).toBe(MODEL_IDS.summary.otari);
    expect(r.costUsd).toBeUndefined();
    expect(openaiCreate.mock.calls[0][0]).not.toHaveProperty("user");
  });

  it("sin OTARI_SERVICE_KEY no envía el usuario (Otari daría 403)", async () => {
    await callLlm({ ...base, provider: "otari", tier: "haiku", endUserId: "user-uuid" });
    expect(openaiCreate.mock.calls[0][0]).not.toHaveProperty("user");

    (MODEL_IDS.sonnet as { otari: string }).otari = "anthropic:claude-haiku-5-5";
    await callLlm({ ...base, provider: "otari", tier: "sonnet", endUserId: "user-uuid" });
    expect(anthropicCreate.mock.calls[0][0]).not.toHaveProperty("metadata");
  });

  it("los defaults de Otari son modelos abiertos", () => {
    expect(defaultOtariModels.every((m) => !m.startsWith("anthropic:"))).toBe(true);
  });

  it("envía reasoning_effort none por defecto, configurable", async () => {
    await callLlm({ ...base, provider: "otari", tier: "haiku" });
    expect(openaiCreate.mock.calls[0][0].reasoning_effort).toBe("none");

    process.env.OTARI_REASONING_EFFORT = "low";
    expect(otariReasoningEffort()).toBe("low");
    process.env.OTARI_REASONING_EFFORT = "omit";
    await callLlm({ ...base, provider: "otari", tier: "summary" });
    expect(openaiCreate.mock.calls[1][0]).not.toHaveProperty("reasoning_effort");
    delete process.env.OTARI_REASONING_EFFORT;
  });

  it("devuelve los veredictos de Otari-Guardrails", async () => {
    const verdicts = [{ profile: "moderation", mode: "monitor", valid: false, score: 0.91, status: "evaluated" }];
    openaiCreate.mockImplementation(() =>
      apiPromise(openaiCompletion(), { "Otari-Guardrails": JSON.stringify(verdicts) })
    );
    const r = await callLlm({ ...base, provider: "otari", tier: "haiku", tag: "ingest_short" });
    expect(r.guardrails).toEqual(verdicts);
    expect(readGuardrails(new Headers({ "Otari-Guardrails": "no-json" }))).toBeUndefined();
    expect(readGuardrails(new Headers())).toBeUndefined();
  });

  it("traduce el 403 budget_exceeded a LlmBudgetExceededError", async () => {
    const budget = Object.assign(new Error("403"), {
      status: 403,
      headers: new Headers({ "Otari-Error-Code": "budget_exceeded", "Otari-Budget-Scope": "end_user" }),
    });
    openaiCreate.mockImplementation(() => ({ withResponse: () => Promise.reject(budget) }));
    const err = await callLlm({ ...base, provider: "otari", tier: "haiku" }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmBudgetExceededError);
    expect(err.scope).toBe("end_user");
  });

  it("otros errores se propagan tal cual", async () => {
    const boom = Object.assign(new Error("502"), { status: 502, headers: new Headers() });
    openaiCreate.mockImplementation(() => ({ withResponse: () => Promise.reject(boom) }));
    await expect(callLlm({ ...base, provider: "otari", tier: "haiku" })).rejects.toBe(boom);
  });
});

describe("provider por defecto", () => {
  it("con OTARI_API_KEY y sin LLM_DEFAULT_PROVIDER es otari", () => {
    expect(DEFAULT_PROVIDER).toBe("otari");
  });

  it("sin OTARI_API_KEY vuelve a anthropic", async () => {
    const saved = process.env.OTARI_API_KEY;
    delete process.env.OTARI_API_KEY;
    vi.resetModules();
    const fresh = await import("../llm-provider");
    expect(fresh.DEFAULT_PROVIDER).toBe("anthropic");
    process.env.OTARI_API_KEY = saved;
  });
});

describe("isValidProvider", () => {
  it("acepta otari solo si hay OTARI_API_KEY", () => {
    expect(isValidProvider("otari")).toBe(true);
    const saved = process.env.OTARI_API_KEY;
    delete process.env.OTARI_API_KEY;
    expect(isValidProvider("otari")).toBe(false);
    expect(isValidProvider("anthropic")).toBe(true);
    expect(isValidProvider("gemini")).toBe(false);
    process.env.OTARI_API_KEY = saved;
  });
});
