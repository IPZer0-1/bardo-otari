/**
 * Lista de zonas horarias que cubre los usuarios actuales del piloto.
 * Si alguien necesita otra, el selector del form la añade dinámicamente
 * (detección automática vía Intl.DateTimeFormat) o se mete por SQL.
 */
export const COMMON_TIMEZONES = [
  "Europe/Madrid",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Bogota",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "America/Tegucigalpa",
  "America/Caracas",
  "UTC",
] as const;

export const FALLBACK_TIMEZONE = "Europe/Madrid";

// Validación laxa de IANA timezone: letra inicial seguida de bloques
// alfanuméricos separados por '/'. Cubre Europe/Madrid, America/New_York,
// America/Argentina/Buenos_Aires, UTC, Etc/GMT+3, etc. Postgres rechazará
// con error si el nombre no existe en su catálogo, pero la validación
// previa en JS evita pasar basura al INSERT/UPDATE.
const TZ_REGEX = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+)*$/;

export function normalizeTimezone(raw: unknown): string {
  if (typeof raw !== "string") return FALLBACK_TIMEZONE;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64) return FALLBACK_TIMEZONE;
  if (!TZ_REGEX.test(trimmed)) return FALLBACK_TIMEZONE;
  return trimmed;
}

/**
 * Valida estrictamente: devuelve null si el input no es una TZ aceptable.
 * Útil para handlers que deben devolver 400 en vez de fallback silencioso.
 */
export function validateTimezoneStrict(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64) return null;
  if (!TZ_REGEX.test(trimmed)) return null;
  return trimmed;
}
