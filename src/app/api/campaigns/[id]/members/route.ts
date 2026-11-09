import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCampaignById } from "@/db/campaigns";
import { getMembersForCampaign } from "@/db/members";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const member = await getCampaignById(id, session.user.id);
  if (!member) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const members = await getMembersForCampaign(id);
  return NextResponse.json({ members });
}
