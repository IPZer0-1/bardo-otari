import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import pool from "@/db/client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { rows } = await pool.query(
    "SELECT email, name, timezone FROM users WHERE id = $1",
    [session.user.id],
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}
