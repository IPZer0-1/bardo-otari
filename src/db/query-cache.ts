import pool from "./client";
import crypto from "crypto";

export interface CachedQuery {
  answer: string;
}

/**
 * Genera un hash determinista de la pregunta (normalizada).
 * Normalización: lowercase, trim, colapsar espacios.
 */
function hashQuestion(question: string): string {
  const normalized = question.toLowerCase().trim().replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Busca una respuesta cacheada para esta pregunta + campaña.
 * Solo devuelve si los docs no han cambiado desde que se cacheó
 * (comparando docs_version = hash del updated_at más reciente).
 */
export async function getCachedAnswer(
  campaignId: string,
  question: string,
  docsVersion: string
): Promise<CachedQuery | null> {
  const questionHash = hashQuestion(question);
  const { rows } = await pool.query(
    `SELECT answer FROM query_cache
     WHERE campaign_id = $1
       AND question_hash = $2
       AND docs_version = $3
       AND created_at > NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [campaignId, questionHash, docsVersion]
  );
  return rows[0] ?? null;
}

/**
 * Guarda una respuesta en el caché.
 * Usa UPSERT para actualizar si ya existe una entrada para la misma pregunta.
 */
export async function cacheAnswer(
  campaignId: string,
  question: string,
  docsVersion: string,
  answer: string
): Promise<void> {
  const questionHash = hashQuestion(question);
  await pool.query(
    `INSERT INTO query_cache (campaign_id, question_hash, docs_version, answer, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (campaign_id, question_hash)
     DO UPDATE SET docs_version = EXCLUDED.docs_version,
                   answer = EXCLUDED.answer,
                   created_at = NOW()`,
    [campaignId, questionHash, docsVersion, answer]
  );
}

/**
 * Calcula la versión de los docs (hash del updated_at más reciente).
 * Cambia cada vez que se hace un upsert en campaign_docs.
 */
export function computeDocsVersion(docs: { updated_at: string | Date }[]): string {
  if (docs.length === 0) return "empty";
  const latest = docs
    .map((d) => (d.updated_at instanceof Date ? d.updated_at.toISOString() : String(d.updated_at)))
    .sort()
    .pop()!;
  return crypto.createHash("md5").update(latest).digest("hex").slice(0, 12);
}
