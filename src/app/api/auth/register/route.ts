import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import pool from "@/db/client";
import {
  InviteCodeError,
  lockAvailableInviteCode,
  markInviteCodeUsed,
} from "@/db/invite-codes";
import { normalizeTimezone } from "@/lib/timezone";

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  invalid: "Código de invitación no válido",
  used: "Ese código de invitación ya se ha usado",
  expired: "Ese código de invitación ha caducado",
};

export async function POST(req: Request) {
  const { email, password, name, code, timezone } = await req.json();
  const tz = normalizeTimezone(timezone);

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Email y contraseña requeridos (mínimo 8 caracteres)" },
      { status: 400 }
    );
  }

  if (!code || typeof code !== "string") {
    return NextResponse.json(
      { error: "Código de invitación requerido" },
      { status: 400 }
    );
  }

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "El email ya está en uso" }, { status: 409 });
  }

  const hashed = await hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockAvailableInviteCode(client, code);
    const { rows } = await client.query(
      "INSERT INTO users (email, name, password, timezone) VALUES ($1, $2, $3, $4) RETURNING id, email, name, timezone",
      [email, name || null, hashed, tz]
    );
    await markInviteCodeUsed(client, code, rows[0].id);
    await client.query("COMMIT");
    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof InviteCodeError) {
      return NextResponse.json(
        { error: INVITE_ERROR_MESSAGES[err.reason] ?? "Código no válido" },
        { status: 403 }
      );
    }
    throw err;
  } finally {
    client.release();
  }
}
