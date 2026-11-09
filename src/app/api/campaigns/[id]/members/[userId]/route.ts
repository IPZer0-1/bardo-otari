import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCampaignById } from "@/db/campaigns";
import { updateMemberPermissions, removeMember } from "@/db/members";

type Params = { params: Promise<{ id: string; userId: string }> };

// PATCH — actualizar rol o permisos (solo creador; master puede otorgar can_edit)
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id: campaignId, userId: targetUserId } = await params;
  const me = await getCampaignById(campaignId, session.user.id);
  if (!me) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const patch = await req.json() as { role?: string; can_invite?: boolean; can_edit?: boolean };

  // Solo el creador puede cambiar roles
  if (patch.role !== undefined && me.role !== "creator") {
    return NextResponse.json({ error: "Solo el creador puede cambiar roles" }, { status: 403 });
  }

  // Creador y master pueden cambiar can_invite
  if (patch.can_invite !== undefined && me.role !== "creator" && me.role !== "master") {
    return NextResponse.json({ error: "Sin permisos para cambiar can_invite" }, { status: 403 });
  }

  // Creador y master pueden otorgar can_edit
  if (patch.can_edit !== undefined && me.role !== "creator" && me.role !== "master") {
    return NextResponse.json({ error: "Sin permisos para cambiar can_edit" }, { status: 403 });
  }

  // No se puede cambiar el rol del creador
  if (targetUserId === session.user.id && patch.role) {
    return NextResponse.json({ error: "No puedes cambiar tu propio rol" }, { status: 400 });
  }

  await updateMemberPermissions(campaignId, targetUserId, patch);
  return NextResponse.json({ ok: true });
}

// DELETE — expulsar miembro (solo creador)
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id: campaignId, userId: targetUserId } = await params;
  const me = await getCampaignById(campaignId, session.user.id);
  if (!me || me.role !== "creator") {
    return NextResponse.json({ error: "Solo el creador puede expulsar miembros" }, { status: 403 });
  }

  await removeMember(campaignId, targetUserId);
  return NextResponse.json({ ok: true });
}
