import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCampaignById } from "@/db/campaigns";
import { getFlaggedUploads } from "@/db/upload-guardrail";

/**
 * Notas marcadas por el guardrail de Otari (posible prompt injection).
 * Solo para creador y máster: contienen texto de otros jugadores.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const member = await getCampaignById(id, session.user.id);
  if (!member) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  if (member.role !== "creator" && member.role !== "master") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const uploads = await getFlaggedUploads(id);
  return NextResponse.json({ uploads });
}
