import pool from "./client";

export interface Member {
  user_id: string;
  name: string | null;
  email: string;
  role: "creator" | "master" | "player";
  can_invite: boolean;
  can_edit: boolean;
  joined_at: string;
}

export async function getMembersForCampaign(campaignId: string): Promise<Member[]> {
  const { rows } = await pool.query(
    `SELECT cm.user_id, u.name, u.email, cm.role, cm.can_invite, cm.can_edit, cm.joined_at
     FROM campaign_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.campaign_id = $1
     ORDER BY cm.joined_at ASC`,
    [campaignId]
  );
  return rows;
}

export async function updateMemberPermissions(
  campaignId: string,
  targetUserId: string,
  patch: { role?: string; can_invite?: boolean; can_edit?: boolean }
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.role !== undefined) { fields.push(`role = $${i++}`); values.push(patch.role); }
  if (patch.can_invite !== undefined) { fields.push(`can_invite = $${i++}`); values.push(patch.can_invite); }
  if (patch.can_edit !== undefined) { fields.push(`can_edit = $${i++}`); values.push(patch.can_edit); }

  if (fields.length === 0) return;

  values.push(campaignId, targetUserId);
  await pool.query(
    `UPDATE campaign_members SET ${fields.join(", ")}
     WHERE campaign_id = $${i++} AND user_id = $${i++}`,
    values
  );
}

export async function removeMember(campaignId: string, targetUserId: string) {
  await pool.query(
    `DELETE FROM campaign_members WHERE campaign_id = $1 AND user_id = $2 AND role != 'creator'`,
    [campaignId, targetUserId]
  );
}
