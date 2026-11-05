import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { setAppSetting } from "@/db/app-settings";
import {
  getProviderStatus,
  isValidProvider,
  LLM_PROVIDER_SETTING_KEY,
} from "@/lib/llm-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  return NextResponse.json(await getProviderStatus());
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const provider = body?.provider;
  if (!isValidProvider(provider)) {
    return NextResponse.json({ error: "provider debe ser anthropic, openai u otari (este último requiere OTARI_API_KEY)" }, { status: 400 });
  }
  await setAppSetting(LLM_PROVIDER_SETTING_KEY, provider, admin.id);
  return NextResponse.json(await getProviderStatus());
}
