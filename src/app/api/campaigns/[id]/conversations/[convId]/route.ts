import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCampaignById } from "@/db/campaigns";
import { getMessagesForConversation } from "@/db/conversations";

type Params = { params: Promise<{ id: string; convId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id: campaignId, convId } = await params;
  const member = await getCampaignById(campaignId, session.user.id);
  if (!member) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const messages = await getMessagesForConversation(convId, session.user.id);
  return NextResponse.json({ messages });
}
