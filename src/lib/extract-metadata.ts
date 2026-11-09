import type { CampaignDoc } from "@/db/docs";

export interface IngestMetadata {
  session: string | null;
  entities: string[];
}

const SESSION_PATTERNS: RegExp[] = [
  /\bsesi[oó]n\s+(\d{1,3})\b/i,
  /\bsession\s+(\d{1,3})\b/i,
];

const SPANISH_MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "setiembre", "octubre", "noviembre", "diciembre",
];

const DATE_PATTERNS: RegExp[] = [
  /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/,
  new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${SPANISH_MONTHS.join("|")})(?:\\s+de\\s+(\\d{2,4}))?\\b`, "i"),
];

/**
 * Detecta el identificador de sesión en las primeras líneas del texto.
 * Busca:
 *   - "Sesión 13" / "Session 13" → "Sesión 13"
 *   - "25/04/2026" → "25/04/2026"
 *   - "25 de abril" / "25 de abril de 2026" → "25 de abril [de 2026]"
 *
 * Solo mira el primer párrafo (~600 caracteres) para evitar falsos positivos del cuerpo.
 */
export function detectSession(text: string): string | null {
  const head = text.slice(0, 600);

  for (const pattern of SESSION_PATTERNS) {
    const match = head.match(pattern);
    if (match) return `Sesión ${match[1]}`;
  }

  for (const pattern of DATE_PATTERNS) {
    const match = head.match(pattern);
    if (match) return match[0];
  }

  return null;
}

const ENTITY_STOPLIST = new Set([
  "notas", "resumen", "hilos", "trama", "tramas", "introduccion", "introducción",
  "indice", "índice", "personajes", "lugares", "islas", "dioses", "objetos",
  "sesiones", "sesion", "sesión", "campaña", "campana", "general", "tabla",
  "información", "informacion", "miscelánea", "miscelanea", "varios", "otros",
  "estado", "datos", "ficha", "fichas", "contexto", "historia", "historial",
  "preguntas", "respuestas", "abiertas", "decisiones", "eventos",
]);

const HEADING_REGEX = /^#{2,4}\s+(.+?)\s*$/gm;

/**
 * Construye un catálogo de entidades a partir de los headings de nivel 2-4 de los docs.
 * Heurística: cada heading es un nombre candidato; se trunca en separadores típicos
 * ("—", "-", ":", "(", ",") y se filtran términos genéricos del stoplist.
 *
 * Implementación deliberadamente simple. Para catálogos <100 entidades es suficiente;
 * cualquier algoritmo más sofisticado (Aho-Corasick) sería over-engineering aquí.
 */
export function extractEntityCatalog(docs: CampaignDoc[]): string[] {
  const seen = new Set<string>();
  const catalog: string[] = [];

  for (const doc of docs) {
    let match: RegExpExecArray | null;
    HEADING_REGEX.lastIndex = 0;
    while ((match = HEADING_REGEX.exec(doc.content)) !== null) {
      const raw = match[1].trim();
      const truncated = raw.split(/[—\-:(,]/, 1)[0].trim();
      if (truncated.length < 3) continue;
      const normalized = truncated.toLowerCase();
      if (ENTITY_STOPLIST.has(normalized)) continue;
      if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(truncated)) continue;
      // Solo aceptamos nombres con al menos un carácter en mayúscula (nombre propio).
      if (truncated === truncated.toLowerCase()) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      catalog.push(truncated);
    }
  }

  return catalog;
}

/**
 * Comprueba qué entidades del catálogo aparecen en el texto.
 * Match case-insensitive con bordes de palabra para evitar falsos positivos
 * tipo "Acasto" matcheando "Acastus".
 */
export function extractKnownEntities(text: string, catalog: string[]): string[] {
  if (catalog.length === 0) return [];
  const lowerText = text.toLowerCase();
  const found: string[] = [];
  for (const entity of catalog) {
    const needle = entity.toLowerCase();
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
    if (re.test(lowerText)) found.push(entity);
  }
  return found;
}

/**
 * Función de conveniencia: extrae todos los metadatos detectables de la nota.
 */
export function extractIngestMetadata(text: string, docs: CampaignDoc[]): IngestMetadata {
  return {
    session: detectSession(text),
    entities: extractKnownEntities(text, extractEntityCatalog(docs)),
  };
}
