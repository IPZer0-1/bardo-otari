import { describe, it, expect } from "vitest";
import { maxGuardrailScore, isGuardrailAlert } from "../guardrails";
import type { GuardrailVerdict } from "../llm-call";

const v = (score: number | null, status = "evaluated"): GuardrailVerdict => ({
  profile: "bardo-injection",
  mode: "monitor",
  valid: score === null ? null : score < 0.5,
  score,
  status,
});

describe("maxGuardrailScore", () => {
  it("toma la puntuación más alta entre router y llamada principal", () => {
    expect(maxGuardrailScore([v(0.4)], [v(1)])).toBe(1);
    expect(maxGuardrailScore([v(0.4)], undefined)).toBe(0.4);
  });

  it("ignora lo no evaluado y devuelve null si no hay nada", () => {
    expect(maxGuardrailScore([v(null, "unavailable")])).toBeNull();
    expect(maxGuardrailScore(undefined, undefined)).toBeNull();
    expect(maxGuardrailScore([v(null, "unavailable"), v(0.2)])).toBe(0.2);
  });
});

describe("isGuardrailAlert", () => {
  it("una nota normal en la ingesta (0.4) no alerta; una inyección (1.0) sí", () => {
    expect(isGuardrailAlert(0.4)).toBe(false);
    expect(isGuardrailAlert(1)).toBe(true);
    expect(isGuardrailAlert(0.9)).toBe(true);
    expect(isGuardrailAlert(null)).toBe(false);
  });

  it("acepta otro umbral", () => {
    expect(isGuardrailAlert(0.5, 0.5)).toBe(true);
  });
});
