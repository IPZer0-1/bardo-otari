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

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...args: unknown[]) => anthropicCreate(...args) };
    constructor(opts: unknown) {
      anthropicCtor(opts);
    }
  },
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: (...args: unknown[]) => openaiCreate(...args) } };
    constructor(opts: unknown) {
      openaiCtor(opts);
    }
  },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/db/app-settings", () => ({ getAppSetting: vi.fn() }));

const { callLlm } = await import("../llm-call");

const base = {
  system: "SYS",
  messages: [{ role: "user" as const, content: "¿Quién es Celeus?" }],
  maxTokens: 100,
};

beforeEach(() => {
  resetSdkMocks();
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
