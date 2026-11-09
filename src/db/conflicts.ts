import pool from "./client";
import type { ConflictItem } from "@/lib/claude";

export async function saveConflicts(
  campaignId: string,
  conflicts: ConflictItem[],
  userId: string
): Promise<void> {
  if (conflicts.length === 0) return;

  for (const c of conflicts) {
    await pool.query(
      `INSERT INTO conflicts
         (campaign_id, file_path, description, version_a, version_a_user, version_a_date, version_b, version_b_user, version_b_date)
       VALUES ($1, $2, $3,
               (SELECT content FROM campaign_docs WHERE campaign_id = $1 AND file_path = $2 LIMIT 1),
               NULL, NULL,
               $4, $5, NOW())`,
      [campaignId, c.file_path, c.description, c.version_b, userId]
    );
  }
}

export async function getConflictsForCampaign(campaignId: string) {
  const { rows } = await pool.query(
    `SELECT
       c.id, c.file_path, c.description,
       c.version_a, c.version_b,
       c.version_b_user, c.version_b_date,
       u.name as submitted_by_name
     FROM conflicts c
     LEFT JOIN users u ON u.id = c.version_b_user
     WHERE c.campaign_id = $1
     ORDER BY c.created_at DESC`,
    [campaignId]
  );
  return rows;
}
