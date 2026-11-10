import pool from "@/db/client";
import { GUARDRAIL_ALERT_SCORE } from "@/lib/guardrails";

const UNDEFINED_COLUMN = "42703";

function isMissingColumn(err: unknown): boolean {
  return (err as { code?: string }).code === UNDEFINED_COLUMN;
}

/**
 * Guarda la puntuación del guardrail en la subida. Nunca rompe la ingesta:
 * si falta la migración 014 o falla la BD, solo deja un aviso en el log.
 */
export async function recordGuardrailScore(uploadId: string | undefined, score: number | null) {
  if (!uploadId || score === null) return;
  try {
    await pool.query(`UPDATE uploads SET guardrail_score = $2 WHERE id = $1`, [uploadId, score]);
  } catch (err) {
    console.warn(
      isMissingColumn(err)
        ? "[guardrail] falta la columna uploads.guardrail_score (migración 014)"
        : `[guardrail] no se pudo guardar la puntuación: ${(err as Error).message}`,
    );
  }
}

export interface FlaggedUpload {
  id: string;
  created_at: string;
  author: string;
  filename: string | null;
  score: number;
  excerpt: string;
}

/** Notas de la campaña que superan el umbral, más recientes primero. */
export async function getFlaggedUploads(campaignId: string, limit = 20): Promise<FlaggedUpload[]> {
  try {
    const { rows } = await pool.query(
      `SELECT up.id, up.created_at, COALESCE(u.name, u.email) AS author, up.filename,
              up.guardrail_score::float AS score, LEFT(up.raw_text, 300) AS excerpt
         FROM uploads up
         JOIN users u ON u.id = up.user_id
        WHERE up.campaign_id = $1 AND up.guardrail_score >= $2
        ORDER BY up.created_at DESC
        LIMIT $3`,
      [campaignId, GUARDRAIL_ALERT_SCORE, limit],
    );
    return rows;
  } catch (err) {
    if (isMissingColumn(err)) return [];
    throw err;
  }
}
