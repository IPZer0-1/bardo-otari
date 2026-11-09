/**
 * Validación post-ingest: red de seguridad para detectar cambios destructivos
 * antes de aplicarlos a campaign_docs.
 *
 * Esta primera versión solo cubre "ningún doc queda vacío". Más checks
 * (headings duplicados, pérdida masiva de bytes, frontmatter intacto…)
 * se añaden incrementalmente con un commit por check.
 */

export interface IngestUpdate {
  file_path: string;
  content: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export function validatePostIngest(updates: IngestUpdate[]): ValidationResult {
  const errors: string[] = [];
  for (const update of updates) {
    if (!update.content.trim()) {
      errors.push(`El documento "${update.file_path}" quedaría vacío tras la ingesta.`);
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
