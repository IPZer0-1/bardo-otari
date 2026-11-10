import type { GuardrailVerdict } from "./llm-call";

/**
 * Umbral a partir del cual una nota se marca para que el máster la revise.
 * Lakera (prompt injection) da ~0.4 a una nota normal dentro del prompt de
 * ingesta (nuestras propias instrucciones) y 1.0 a una inyección clara, así
 * que su `valid` no sirve: usamos la puntuación.
 */
function readAlertScore(): number {
  const parsed = Number.parseFloat(process.env.OTARI_GUARDRAIL_ALERT_SCORE ?? "");
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : 0.9;
}

export const GUARDRAIL_ALERT_SCORE = readAlertScore();

/** Puntuación más alta entre los veredictos evaluados; null si ninguno lo fue. */
export function maxGuardrailScore(
  ...lists: (GuardrailVerdict[] | undefined)[]
): number | null {
  let max: number | null = null;
  for (const list of lists) {
    for (const v of list ?? []) {
      if (v.status !== "evaluated" || typeof v.score !== "number") continue;
      max = max === null ? v.score : Math.max(max, v.score);
    }
  }
  return max;
}

export function isGuardrailAlert(score: number | null, threshold = GUARDRAIL_ALERT_SCORE): boolean {
  return score !== null && score >= threshold;
}
