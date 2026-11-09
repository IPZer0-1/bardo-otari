import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCampaignById } from "@/db/campaigns";
import { getConversationsForUser, createConversation } from "@/db/conversations";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id: campaignId } = await params;
  const member = await getCampaignById(campaignId, session.user.id);
  if (!member) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const conversations = await getConversationsForUser(campaignId, session.user.id);
  return NextResponse.json({ conversations });
}

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id: campaignId } = await params;
  const member = await getCampaignById(campaignId, session.user.id);
  if (!member) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const conversation = await createConversation(campaignId, session.user.id);
  return NextResponse.json({ conversation }, { status: 201 });
}
