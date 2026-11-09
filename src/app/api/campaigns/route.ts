import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createCampaign, getCampaignsForUser } from "@/db/campaigns";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const campaigns = await getCampaignsForUser(session.user.id);
  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const campaign = await createCampaign(name.trim(), description || null, session.user.id);
  return NextResponse.json({ campaign }, { status: 201 });
}
