import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMonthlyUsage, MONTHLY_GOLD_CAP } from "@/lib/quota";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { used, timezone, resetAt } = await getMonthlyUsage(session.user.id);
  const remaining = Math.max(0, MONTHLY_GOLD_CAP - used);

  return NextResponse.json({
    used,
    cap: MONTHLY_GOLD_CAP,
    remaining,
    timezone,
    reset_at: resetAt.toISOString(),
  });
}
