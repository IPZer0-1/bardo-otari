import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCampaignById } from "@/db/campaigns";
import { getDocByPath, upsertDoc } from "@/db/docs";

type Params = { params: Promise<{ id: string; file: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id: campaignId, file } = await params;
  const member = await getCampaignById(campaignId, session.user.id);
  if (!member) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const doc = await getDocByPath(campaignId, decodeURIComponent(file));
  if (!doc) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });

  return NextResponse.json({ doc });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id: campaignId, file } = await params;
  const member = await getCampaignById(campaignId, session.user.id);
  if (!member) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  // Solo pueden editar: creator, master, o player con can_edit
  const canEdit =
    member.role === "creator" ||
    member.role === "master" ||
    member.can_edit === true;

  if (!canEdit) return NextResponse.json({ error: "Sin permisos de edición" }, { status: 403 });

  const { content } = await req.json();
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content requerido" }, { status: 400 });
  }

  await upsertDoc(campaignId, decodeURIComponent(file), content, session.user.id);
  return NextResponse.json({ ok: true });
}
