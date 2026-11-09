import { cookies } from "next/headers";
import { getAppSetting } from "@/db/app-settings";

export type LlmProvider = "anthropic" | "openai";

export const LLM_PROVIDER_COOKIE = "llm-provider";

/**
 * Provider por defecto cuando no hay cookie. Se controla con la env var
 * LLM_DEFAULT_PROVIDER (anthropic | openai). Por defecto "anthropic"
 * (Haiku 5.5 es más barato que cualquier opción vigente de OpenAI); en
 * desarrollo el toggle visual lo sobrescribe vía cookie.
 */
function readDefaultProvider(): LlmProvider {
  const raw = process.env.LLM_DEFAULT_PROVIDER;
  if (raw === "anthropic" || raw === "openai") return raw;
  return "anthropic";
}

export const DEFAULT_PROVIDER: LlmProvider = readDefaultProvider();

/**
 * IDs concretos por tier y provider. Cada celda admite override por env var
 * sin tocar código — basta con editar `.env.local` (o `environment` del
 * docker-compose) y reiniciar el contenedor.
 *
 * Tiers:
 *   haiku    → modelo barato/rápido para queries y correcciones puntuales.
 *   sonnet   → modelo medio para ingestas pesadas (notas largas con
 *              docs+conflicts en JSON estricto).
 *   summary  → modelo barato para selectores de docs y resúmenes de
 *              historia conversacional.
 *
 * Recomendaciones (2026-10). Precios $/1M tokens entrada / salida.
 *
 *   anthropic (default):
 *     haiku    claude-haiku-5-5    $0.10 / $0.50 (>100K prompt: $0.50 / $2.50)
 *     sonnet   claude-haiku-5-5    (más barato que gpt-5-mini, que era el
 *              modelo de producción). claude-sonnet-5-5 ($2 / $10) si
 *              Haiku se queda corto en las ingestas largas.
 *     summary  claude-haiku-5-5
 *
 *   openai (alternativa): gpt-5.6-luna en los tres tiers — $0.20 / $1.20.
 *     gpt-5.6-terra ($2 / $12) si luna se queda corto en JSON estricto.
 *     gpt-5 / gpt-5-mini / gpt-5-nano se apagan el 2026-12-11.
 *
 * Al cambiar de modelo revisa THINKING_CONFIG en llm-call.ts: los modelos
 * Claude 5.x razonan por defecto (más tokens de salida facturados).
 */
export const MODEL_IDS = {
  haiku: {
    openai:    process.env.LLM_MODEL_HAIKU_OPENAI    ?? "gpt-5.6-luna",
    anthropic: process.env.LLM_MODEL_HAIKU_ANTHROPIC ?? "claude-haiku-5-5",
  },
  sonnet: {
    openai:    process.env.LLM_MODEL_SONNET_OPENAI    ?? "gpt-5.6-luna",
    anthropic: process.env.LLM_MODEL_SONNET_ANTHROPIC ?? "claude-haiku-5-5",
  },
  summary: {
    openai:    process.env.LLM_MODEL_SUMMARY_OPENAI    ?? "gpt-5.6-luna",
    anthropic: process.env.LLM_MODEL_SUMMARY_ANTHROPIC ?? "claude-haiku-5-5",
  },
} as const;

export function isValidProvider(value: unknown): value is LlmProvider {
  return value === "anthropic" || value === "openai";
}

export const LLM_PROVIDER_SETTING_KEY = "llm_provider";

export interface ProviderStatus {
  provider: LlmProvider;
  /** De dónde sale el valor: toggle del panel admin (BD) o env var. */
  source: "admin" | "env";
  updatedAt: Date | null;
  updatedBy: string | null;
}

/**
 * Provider global: el elegido en el panel admin (tabla app_settings) o, si
 * no hay ninguno o la BD falla, LLM_DEFAULT_PROVIDER. Una consulta por
 * llamada LLM: es una lectura por clave primaria, despreciable frente al LLM.
 */
export async function getProviderStatus(): Promise<ProviderStatus> {
  try {
    const setting = await getAppSetting(LLM_PROVIDER_SETTING_KEY);
    if (setting && isValidProvider(setting.value)) {
      return {
        provider: setting.value,
        source: "admin",
        updatedAt: setting.updated_at,
        updatedBy: setting.updated_by_email,
      };
    }
  } catch (err) {
    // Tabla aún no migrada o BD caída: no bloqueamos las llamadas LLM.
    console.error("[llm-provider] no se pudo leer app_settings:", err);
  }
  return { provider: DEFAULT_PROVIDER, source: "env", updatedAt: null, updatedBy: null };
}

/**
 * Provider para la llamada actual. En desarrollo manda la cookie del
 * DevModelToggle; en producción se ignora (cualquiera podría fijarla a
 * mano) y manda el panel admin, con el env var como respaldo.
 */
export async function getCurrentProvider(): Promise<LlmProvider> {
  if (process.env.NODE_ENV !== "production") {
    try {
      const store = await cookies();
      const raw = store.get(LLM_PROVIDER_COOKIE)?.value;
      if (isValidProvider(raw)) return raw;
    } catch {
      // Fuera de un request handler `cookies()` lanza — seguimos.
    }
  }
  return (await getProviderStatus()).provider;
}
