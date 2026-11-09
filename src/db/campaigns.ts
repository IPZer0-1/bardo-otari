import pool from "./client";

function generateInviteCode(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase())
    .join("");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${initials}-${random}`;
}

export async function createCampaign(
  name: string,
  description: string | null,
  creatorId: string
) {
  const inviteCode = generateInviteCode(name);
  const { rows } = await pool.query(
    `INSERT INTO campaigns (name, description, creator_id, invite_code)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, description, invite_code, created_at`,
    [name, description, creatorId, inviteCode]
  );
  const campaign = rows[0];

  // Añadir al creador como miembro con rol 'creator'
  await pool.query(
    `INSERT INTO campaign_members (campaign_id, user_id, role, can_invite, can_edit)
     VALUES ($1, $2, 'creator', true, true)`,
    [campaign.id, creatorId]
  );

  return campaign;
}

export async function getCampaignsForUser(userId: string) {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.description, c.invite_code, c.created_at, cm.role, cm.can_edit, cm.can_invite
     FROM campaigns c
     JOIN campaign_members cm ON cm.campaign_id = c.id
     WHERE cm.user_id = $1
     ORDER BY c.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function getCampaignById(campaignId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.description, c.invite_code, c.created_at, cm.role, cm.can_invite, cm.can_edit
     FROM campaigns c
     JOIN campaign_members cm ON cm.campaign_id = c.id
     WHERE c.id = $1 AND cm.user_id = $2`,
    [campaignId, userId]
  );
  return rows[0] || null;
}

export async function joinCampaignByCode(inviteCode: string, userId: string) {
  const { rows } = await pool.query(
    "SELECT id FROM campaigns WHERE invite_code = $1",
    [inviteCode]
  );
  if (!rows[0]) throw new Error("Código de invitación inválido");

  const campaignId = rows[0].id;

  // Verificar que no sea ya miembro
  const existing = await pool.query(
    "SELECT id FROM campaign_members WHERE campaign_id = $1 AND user_id = $2",
    [campaignId, userId]
  );
  if (existing.rows.length > 0) throw new Error("Ya eres miembro de esta campaña");

  await pool.query(
    `INSERT INTO campaign_members (campaign_id, user_id, role, can_invite, can_edit)
     VALUES ($1, $2, 'player', false, false)`,
    [campaignId, userId]
  );

  return campaignId;
}
