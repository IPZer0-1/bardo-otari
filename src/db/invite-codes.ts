import type { PoolClient } from "pg";

export type InviteCodeErrorReason = "invalid" | "used" | "expired";

export class InviteCodeError extends Error {
  constructor(public reason: InviteCodeErrorReason) {
    super(`invite_code_${reason}`);
    this.name = "InviteCodeError";
  }
}

// Bloquea la fila del invite_code y valida que sea consumible.
// Debe llamarse dentro de una transacción; el FOR UPDATE evita que dos
// registros simultáneos con el mismo código pasen ambos la validación.
export async function lockAvailableInviteCode(
  client: PoolClient,
  code: string
): Promise<void> {
  const { rows } = await client.query<{
    used_by: string | null;
    expires_at: Date | null;
  }>(
    `SELECT used_by, expires_at
       FROM invite_codes
      WHERE code = $1
      FOR UPDATE`,
    [code]
  );
  if (rows.length === 0) throw new InviteCodeError("invalid");
  if (rows[0].used_by !== null) throw new InviteCodeError("used");
  if (rows[0].expires_at && rows[0].expires_at < new Date()) {
    throw new InviteCodeError("expired");
  }
}

export async function markInviteCodeUsed(
  client: PoolClient,
  code: string,
  userId: string
): Promise<void> {
  await client.query(
    `UPDATE invite_codes SET used_by = $1, used_at = NOW() WHERE code = $2`,
    [userId, code]
  );
}
