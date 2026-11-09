import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import pool from "@/db/client";
import { validateTimezoneStrict } from "@/lib/timezone";
import { getMonthlyUsage } from "@/lib/quota";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const tz = validateTimezoneStrict(body?.timezone);
  if (!tz) {
    return NextResponse.json(
      { error: "Zona horaria no válida" },
      { status: 400 },
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Bloqueo la fila del user para evitar race entre dos PATCH paralelos.
    const { rows: userRows } = await client.query(
      "SELECT timezone FROM users WHERE id = $1 FOR UPDATE",
      [session.user.id],
    );
    if (userRows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    const currentTz = userRows[0].timezone as string;

    // No-op si la TZ no cambia: no quemamos un carry sin motivo.
    if (currentTz === tz) {
      await client.query("COMMIT");
      return NextResponse.json({ timezone: tz });
    }

    // Snapshot del consumo actual con la TZ vieja (incluye carry previo si
    // estaba activo). getMonthlyUsage usa pool.query directo y no ve la
    // transacción, pero la lectura del SUM no necesita estar dentro de
    // ella: el peor caso es que entren 1-2 monedas extra entre el SELECT
    // y el UPDATE; aceptable.
    const { used: prevUsed } = await getMonthlyUsage(session.user.id);

    // Primer día del próximo mes a las 00:00 hora local en la TZ nueva,
    // expresado en UTC. date_trunc('month', NOW() AT TIME ZONE $tz) da las
    // 00:00 del día 1 de ESTE mes en $tz como timestamp sin TZ; sumando 1
    // mes y reinterpretando en $tz lo pasamos a timestamptz UTC del
    // próximo corte mensual.
    const { rows: resetRows } = await client.query(
      `SELECT (date_trunc('month', NOW() AT TIME ZONE $1) + INTERVAL '1 month') AT TIME ZONE $1 AS next_reset`,
      [tz],
    );
    const nextReset = resetRows[0].next_reset as Date;

    await client.query(
      `UPDATE users
          SET timezone = $1,
              tz_carry_used = $2,
              tz_carry_from = NOW(),
              tz_carry_resets_at = $3
        WHERE id = $4`,
      [tz, prevUsed, nextReset, session.user.id],
    );

    await client.query("COMMIT");
    return NextResponse.json({ timezone: tz });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // Postgres rechaza con error 22023 si el nombre de TZ no existe en su
    // catálogo (regex JS aceptó pero PG no la conoce). Traducimos a 400.
    const code = (err as { code?: string })?.code;
    if (code === "22023") {
      return NextResponse.json(
        { error: "Zona horaria desconocida por la base de datos" },
        { status: 400 },
      );
    }
    throw err;
  } finally {
    client.release();
  }
}
