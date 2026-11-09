import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCampaignById } from "@/db/campaigns";
import { getDocsForCampaign } from "@/db/docs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const member = await getCampaignById(id, session.user.id);
  if (!member) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const docs = await getDocsForCampaign(id);
  return NextResponse.json({ docs });
}
