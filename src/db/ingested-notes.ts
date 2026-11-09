import pool from "./client";
import crypto from "crypto";

export interface DuplicateMatch {
  upload_id: string | null;
  ingested_at: Date;
}

/**
 * Normaliza el texto y devuelve sha256 hex (64 chars).
 * Normalización: lowercase, trim, colapsar todo whitespace (incluido saltos de línea) a un único espacio.
 * Misma estrategia que query-cache para mantener coherencia.
 */
export function normalizeAndHash(text: string): string {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Busca si esta nota ya fue ingestada para esta campaña.
 * Devuelve el upload original y la fecha si hay duplicado, null en caso contrario.
 */
export async function findDuplicate(
  campaignId: string,
  contentHash: string
): Promise<DuplicateMatch | null> {
  const { rows } = await pool.query<DuplicateMatch>(
    `SELECT upload_id, ingested_at
       FROM ingested_notes
      WHERE campaign_id = $1 AND content_hash = $2
      LIMIT 1`,
    [campaignId, contentHash]
  );
  return rows[0] ?? null;
}

/**
 * Registra un hash de nota tras ingesta exitosa.
 * Idempotente: si ya existe (carrera), no hace nada.
 */
export async function recordIngestedNote(
  campaignId: string,
  contentHash: string,
  uploadId: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO ingested_notes (campaign_id, content_hash, upload_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (campaign_id, content_hash) DO NOTHING`,
    [campaignId, contentHash, uploadId]
  );
}
