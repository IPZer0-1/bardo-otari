import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Ingest puede tardar 60-90s con Sonnet en docs grandes.
// Sin esto Next.js corta a 60s por defecto en producción.
export const maxDuration = 120;
import { getCampaignById } from "@/db/campaigns";
import { appendToDoc, getDocsForCampaign, upsertDoc } from "@/db/docs";
import { saveConflicts } from "@/db/conflicts";
import { ingestNotes, startBatchIngest, ingestCorrection, shouldIngestUseHaiku, type IngestPromptMetadata } from "@/lib/claude";
import { extractText } from "@/lib/extract";
import { findDuplicate, normalizeAndHash, recordIngestedNote } from "@/db/ingested-notes";
import { validatePostIngest } from "@/lib/validate-ingest";
import { extractIngestMetadata } from "@/lib/extract-metadata";
import { getCurrentProvider } from "@/lib/llm-provider";
import { LlmBudgetExceededError } from "@/lib/llm-call";
import {
  ensureQuota,
  GOLD_COSTS,
  QuotaExceededError,
  buildGatewayBudgetResponse,
  buildQuotaExceededResponse,
  type LlmOperation,
} from "@/lib/quota";
import pool from "@/db/client";

type IngestKind = "session" | "correction" | "entity" | "auto";
const VALID_KINDS: IngestKind[] = ["session", "correction", "entity", "auto"];

const AUTO_BATCH_MIN_WORDS = 1000;
const DEDUP_ENABLED = process.env.INGEST_DEDUP_ENABLED === "true";
const VALIDATION_ENABLED = process.env.INGEST_VALIDATION_ENABLED === "true";
const METADATA_ENABLED = process.env.INGEST_METADATA_ENABLED === "true";
const ROUTING_ENABLED = process.env.INGEST_ROUTING_ENABLED === "true";

function parseKind(raw: unknown): IngestKind {
  if (typeof raw === "string" && (VALID_KINDS as string[]).includes(raw)) {
    return raw as IngestKind;
  }
  return "auto";
}

// Heurística para 'auto':
//   - "nuevo pnj:" / "nuevo lugar:" → entity
//   - texto corto (<100 palabras) con marcadores típicos de corrección → correction
//   - resto → session
const CORRECTION_HINTS = /\b(no es|no era|en realidad|corregir|corrección|correccion|tiene|debería ser|deberia ser)\b/i;
const ENTITY_HINTS = /\b(nuevo\s+(pnj|personaje|lugar|isla|dios|objeto):)/i;

function resolveKind(kind: IngestKind, trimmedText: string): IngestKind {
  if (kind !== "auto") return kind;
  if (ENTITY_HINTS.test(trimmedText)) return "entity";
  const wordCount = trimmedText.split(/\s+/).length;
  if (wordCount < 100 && CORRECTION_HINTS.test(trimmedText)) return "correction";
  return "session";
}

function countWords(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).length;
}

function uniqueFilePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

// Ingesta desde texto plano
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const contentType = req.headers.get("content-type") || "";
  let campaignId: string;
  let rawText: string;
  let filename: string | null = null;
  let requestedKind: IngestKind = "auto";
  let entityTargetFile: string | null = null;
  let entityMarkdown: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    campaignId = form.get("campaign_id") as string;
    const file = form.get("file") as File | null;
    const text = form.get("text") as string | null;
    requestedKind = parseKind(form.get("kind"));
    entityTargetFile = (form.get("target_file") as string | null) || null;
    entityMarkdown = (form.get("entity_markdown") as string | null) || null;

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      rawText = await extractText(buffer, file.name);
      filename = file.name;
    } else if (text) {
      rawText = text;
    } else if (requestedKind === "entity" && entityMarkdown) {
      rawText = entityMarkdown;
    } else {
      return NextResponse.json({ error: "Proporciona texto o un fichero" }, { status: 400 });
    }
  } else {
    const body = await req.json();
    campaignId = body.campaign_id;
    rawText = body.text;
    requestedKind = parseKind(body.kind);
    entityTargetFile = typeof body.target_file === "string" ? body.target_file : null;
    entityMarkdown = typeof body.entity_markdown === "string" ? body.entity_markdown : null;
    if (requestedKind === "entity" && !rawText && entityMarkdown) {
      rawText = entityMarkdown;
    }
  }

  if (!campaignId || !rawText?.trim()) {
    return NextResponse.json({ error: "campaign_id y contenido son requeridos" }, { status: 400 });
  }

  const member = await getCampaignById(campaignId, session.user.id);
  if (!member) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  // Guardar upload en DB
  const uploadInsert = await pool.query<{ id: string }>(
    `INSERT INTO uploads (campaign_id, user_id, raw_text, filename, status, kind)
     VALUES ($1, $2, $3, $4, 'processing', $5)
     RETURNING id`,
    [campaignId, session.user.id, rawText, filename, requestedKind]
  );
  const uploadId = uploadInsert.rows[0]?.id;

  const provider = await getCurrentProvider();

  try {
    const docs = await getDocsForCampaign(campaignId);
    const trimmedText = rawText.trim();
    const wordCount = countWords(trimmedText);
    const contentHash = normalizeAndHash(trimmedText);

    if (DEDUP_ENABLED) {
      const existing = await findDuplicate(campaignId, contentHash);
      if (existing) {
        if (uploadId) {
          await pool.query(`UPDATE uploads SET status = 'done' WHERE id = $1`, [uploadId]);
        }
        return NextResponse.json({
          status: "duplicate",
          original_upload_id: existing.upload_id,
          ingested_at: existing.ingested_at,
        });
      }
    }

    let metadata: IngestPromptMetadata | undefined;
    if (METADATA_ENABLED) {
      const detected = extractIngestMetadata(trimmedText, docs);
      metadata = { session: detected.session, entities: detected.entities };
      console.log(
        `[ingest] metadata detectada upload=${uploadId ?? "?"} session=${detected.session ?? "-"} entities=${detected.entities.length}`,
        detected.entities.length > 0 ? detected.entities : ""
      );
    }

    const effectiveKind: IngestKind = ROUTING_ENABLED ? resolveKind(requestedKind, trimmedText) : "session";

    // Decisión de coste lógica (en monedas), antes de pegar al LLM:
    //   - entity → 0 (append determinista, sin LLM).
    //   - correction → tarifa de corrección.
    //   - session vía batch → tarifa de batch (Anthropic-only).
    //   - session sync con tier haiku (notas cortas, pocos docs) → corta.
    //   - session sync con tier sonnet → larga.
    // Para batch + sync largo el tier real lo decide claude.ts; usamos
    // el peor caso para la cuota y persistimos el mismo valor en el log.
    const forceBatch = new URL(req.url).searchParams.get("mode") === "batch";
    const useBatch = (forceBatch || wordCount >= AUTO_BATCH_MIN_WORDS) && provider === "anthropic";
    let quotaOp: LlmOperation;
    if (effectiveKind === "entity") {
      quotaOp = "ingest_entity";
    } else if (effectiveKind === "correction") {
      quotaOp = "ingest_correction";
    } else if (useBatch) {
      quotaOp = "ingest_batch";
    } else if (shouldIngestUseHaiku(docs, trimmedText)) {
      quotaOp = "ingest_short";
    } else {
      quotaOp = "ingest_long";
    }

    try {
      await ensureQuota(session.user.id, quotaOp);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        if (uploadId) {
          await pool.query(`UPDATE uploads SET status = 'failed' WHERE id = $1`, [uploadId]);
        }
        return NextResponse.json(buildQuotaExceededResponse(err), { status: 429 });
      }
      throw err;
    }

    if (effectiveKind === "entity") {
      if (!entityTargetFile || !entityMarkdown?.trim()) {
        if (uploadId) {
          await pool.query(`UPDATE uploads SET status = 'failed' WHERE id = $1`, [uploadId]);
        }
        return NextResponse.json(
          { error: "Para 'entity' se requieren target_file y entity_markdown" },
          { status: 400 }
        );
      }

      await appendToDoc(campaignId, entityTargetFile, entityMarkdown, session.user.id);

      if (uploadId) {
        await pool.query(`UPDATE uploads SET status = 'done' WHERE id = $1`, [uploadId]);
      }
      if (DEDUP_ENABLED) {
        await recordIngestedNote(campaignId, contentHash, uploadId ?? null);
      }

      pool.query(
        `INSERT INTO usage_logs (user_id, campaign_id, operation, token_count, cache_creation_tokens, cache_read_tokens, model, gold_cost)
         VALUES ($1, $2, 'ingest_entity', 0, 0, 0, 'none', $3)`,
        [session.user.id, campaignId, GOLD_COSTS.ingest_entity]
      ).catch(() => {});

      return NextResponse.json({
        status: "done",
        mode: "entity",
        updated_files: [entityTargetFile],
        conflicts: 0,
      });
    }

    if (effectiveKind === "correction") {
      const result = await ingestCorrection(docs, trimmedText, metadata, provider, session.user.id);

      if (VALIDATION_ENABLED) {
        const validation = validatePostIngest(result.updates);
        if (!validation.ok) {
          console.error("Correction validation failed:", validation.errors);
          if (uploadId) {
            await pool.query(`UPDATE uploads SET status = 'failed' WHERE id = $1`, [uploadId]);
          }
          return NextResponse.json(
            { error: "La corrección no pasó la validación", details: validation.errors },
            { status: 422 }
          );
        }
      }

      for (const update of result.updates) {
        await upsertDoc(campaignId, update.file_path, update.content, session.user.id);
      }
      await saveConflicts(campaignId, result.conflicts, session.user.id);

      if (uploadId) {
        await pool.query(`UPDATE uploads SET status = 'done' WHERE id = $1`, [uploadId]);
      }
      if (DEDUP_ENABLED) {
        await recordIngestedNote(campaignId, contentHash, uploadId ?? null);
      }

      pool.query(
        `INSERT INTO usage_logs (user_id, campaign_id, operation, token_count, cache_creation_tokens, cache_read_tokens, model, gold_cost)
         VALUES ($1, $2, 'ingest_correction', $3, $4, $5, $6, $7)`,
        [
          session.user.id,
          campaignId,
          result.input_tokens + result.output_tokens,
          result.cache_creation_tokens,
          result.cache_read_tokens,
          result.model,
          GOLD_COSTS.ingest_correction,
        ]
      ).catch(() => {});

      return NextResponse.json({
        status: "done",
        mode: "correction",
        updated_files: uniqueFilePaths(result.updates.map((u) => u.file_path)),
        conflicts: result.conflicts.length,
      });
    }

    // forceBatch/useBatch ya calculados arriba para la decisión de cuota.
    // La Anthropic Batch API no tiene equivalente directo en OpenAI ni en
    // Otari (su /batches es de estilo OpenAI); con esos providers caemos a
    // llamada síncrona aunque la nota sea larga.
    if (useBatch) {
      const { batchId, customId } = await startBatchIngest(docs, trimmedText, metadata);
      await pool.query(
        `INSERT INTO batch_jobs (campaign_id, user_id, batch_id, custom_id, raw_text, filename)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [campaignId, session.user.id, batchId, customId, rawText, filename]
      );
      return NextResponse.json({
        status: "processing",
        mode: "batch",
        batch_id: batchId,
        custom_id: customId,
        word_count: wordCount,
        auto_batch: !forceBatch,
      });
    }

    const result = await ingestNotes(docs, trimmedText, metadata, provider, session.user.id);

    if (VALIDATION_ENABLED) {
      const validation = validatePostIngest(result.updates);
      if (!validation.ok) {
        console.error("Ingest validation failed:", validation.errors);
        if (uploadId) {
          await pool.query(`UPDATE uploads SET status = 'failed' WHERE id = $1`, [uploadId]);
        }
        return NextResponse.json(
          { error: "La ingesta no pasó la validación", details: validation.errors },
          { status: 422 }
        );
      }
    }

    // Aplicar updates
    for (const update of result.updates) {
      await upsertDoc(campaignId, update.file_path, update.content, session.user.id);
    }

    // Guardar conflictos con autoría
    await saveConflicts(campaignId, result.conflicts, session.user.id);

    // Marcar upload como done
    if (uploadId) {
      await pool.query(`UPDATE uploads SET status = 'done' WHERE id = $1`, [uploadId]);
    }

    if (DEDUP_ENABLED) {
      await recordIngestedNote(campaignId, contentHash, uploadId ?? null);
    }

    // Registrar uso. quotaOp aquí es "ingest_short" o "ingest_long" según
    // el tier que claude.ts haya elegido (mismo criterio que el pre-check).
    pool.query(
      `INSERT INTO usage_logs (user_id, campaign_id, operation, token_count, cache_creation_tokens, cache_read_tokens, model, gold_cost)
       VALUES ($1, $2, 'ingest', $3, $4, $5, $6, $7)`,
      [
        session.user.id,
        campaignId,
        result.input_tokens + result.output_tokens,
        result.cache_creation_tokens,
        result.cache_read_tokens,
        result.model,
        GOLD_COSTS[quotaOp],
      ]
    ).catch(() => {});

    return NextResponse.json({
      status: "done",
      mode: "sync",
      updated_files: uniqueFilePaths(result.updates.map((u) => u.file_path)),
      conflicts: result.conflicts.length,
    });
  } catch (err) {
    if (uploadId) {
      await pool.query(`UPDATE uploads SET status = 'failed' WHERE id = $1`, [uploadId]);
    }
    if (err instanceof LlmBudgetExceededError) {
      return NextResponse.json(buildGatewayBudgetResponse(), { status: 429 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("Ingest error:", message);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "development" ? `Error: ${message}` : "Error al procesar las notas" },
      { status: 500 }
    );
  }
}
