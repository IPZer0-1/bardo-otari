import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { joinCampaignByCode } from "@/db/campaigns";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { invite_code } = await req.json();
  if (!invite_code) return NextResponse.json({ error: "Código requerido" }, { status: 400 });

  try {
    const campaignId = await joinCampaignByCode(invite_code.trim(), session.user.id);
    return NextResponse.json({ campaign_id: campaignId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error al unirse";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
