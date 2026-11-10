import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCampaignById } from "@/db/campaigns";
import { getDocsForCampaign } from "@/db/docs";
import { queryCampaign } from "@/lib/claude";
import { getCurrentProvider } from "@/lib/llm-provider";
import { LlmBudgetExceededError } from "@/lib/llm-call";
import {
  ensureQuota,
  GOLD_COSTS,
  QuotaExceededError,
  buildGatewayBudgetResponse,
  buildQuotaExceededResponse,
} from "@/lib/quota";
import {
  createConversation,
  getMessagesForConversation,
  saveMessages,
} from "@/db/conversations";
import { getCachedAnswer, cacheAnswer, computeDocsVersion } from "@/db/query-cache";
import { insertUsageLog } from "@/db/usage-logs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    await ensureQuota(session.user.id, "query");
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(buildQuotaExceededResponse(err), { status: 429 });
    }
    throw err;
  }

  const { campaign_id, question, conversation_id } = await req.json();
  if (!campaign_id || !question?.trim()) {
    return NextResponse.json({ error: "campaign_id y question son requeridos" }, { status: 400 });
  }

  const member = await getCampaignById(campaign_id, session.user.id);
  if (!member) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  // Resolver conversación: usar la existente o crear una nueva
  let convId: string = conversation_id;
  if (!convId) {
    const conv = await createConversation(campaign_id, session.user.id);
    convId = conv.id;
  }

  const HISTORY_LIMIT = 20;
  const history = await getMessagesForConversation(convId, session.user.id);
  const historyMessages = history.slice(-HISTORY_LIMIT).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const docs = await getDocsForCampaign(campaign_id);
  const docsVersion = computeDocsVersion(docs);
  const provider = await getCurrentProvider();

  // La key del cache incluye el provider para que cambiar de modelo
  // invalide automáticamente las respuestas previas del otro.
  const cacheQuestionKey = `[${provider}] ${question.trim()}`;

  if (historyMessages.length === 0) {
    const cached = await getCachedAnswer(campaign_id, cacheQuestionKey, docsVersion);
    if (cached) {
      await saveMessages(convId, question.trim(), cached.answer);
      return NextResponse.json({ answer: cached.answer, conversation_id: convId, cached: true });
    }
  }

  let result;
  try {
    result = await queryCampaign(docs, question.trim(), historyMessages, provider, session.user.id);
  } catch (err) {
    if (err instanceof LlmBudgetExceededError) {
      return NextResponse.json(buildGatewayBudgetResponse(err), {
        status: 429,
        headers: err.retryAfterSec != null ? { "Retry-After": String(err.retryAfterSec) } : undefined,
      });
    }
    throw err;
  }

  if (historyMessages.length === 0) {
    cacheAnswer(campaign_id, cacheQuestionKey, docsVersion, result.answer).catch(() => {});
  }

  await saveMessages(convId, question.trim(), result.answer);

  insertUsageLog({
    userId: session.user.id,
    campaignId: campaign_id,
    operation: "query",
    tokenCount: result.input_tokens + result.output_tokens,
    cacheCreationTokens: result.cache_creation_tokens,
    cacheReadTokens: result.cache_read_tokens,
    model: result.model,
    goldCost: GOLD_COSTS.query,
    costUsd: result.cost_usd,
  }).catch(() => {});

  return NextResponse.json({ answer: result.answer, conversation_id: convId });
}
