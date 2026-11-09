import pool from "./client";

export interface CampaignDoc {
  id: string;
  file_path: string;
  content: string;
  updated_at: string;
}

export async function getDocsForCampaign(campaignId: string): Promise<CampaignDoc[]> {
  const { rows } = await pool.query(
    `SELECT id, file_path, content, updated_at
     FROM campaign_docs
     WHERE campaign_id = $1
     ORDER BY file_path ASC`,
    [campaignId]
  );
  return rows;
}

export async function upsertDoc(
  campaignId: string,
  filePath: string,
  content: string,
  updatedBy: string
): Promise<void> {
  await pool.query(
    `INSERT INTO campaign_docs (campaign_id, file_path, content, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (campaign_id, file_path)
     DO UPDATE SET content = EXCLUDED.content,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = NOW()`,
    [campaignId, filePath, content, updatedBy]
  );
}

export async function getDocByPath(campaignId: string, filePath: string): Promise<CampaignDoc | null> {
  const { rows } = await pool.query(
    `SELECT id, file_path, content, updated_at
     FROM campaign_docs
     WHERE campaign_id = $1 AND file_path = $2`,
    [campaignId, filePath]
  );
  return rows[0] || null;
}

/**
 * Append determinista de un bloque markdown al final del documento.
 * Si el doc no existe, lo crea con el contenido. Sin LLM.
 */
export async function appendToDoc(
  campaignId: string,
  filePath: string,
  appendedContent: string,
  updatedBy: string
): Promise<void> {
  const existing = await getDocByPath(campaignId, filePath);
  const block = appendedContent.trim();
  if (!block) return;
  const newContent = existing
    ? `${existing.content.replace(/\s+$/, "")}\n\n${block}\n`
    : `${block}\n`;
  await upsertDoc(campaignId, filePath, newContent, updatedBy);
}
