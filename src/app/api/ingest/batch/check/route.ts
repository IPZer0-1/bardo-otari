import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCampaignById } from "@/db/campaigns";
import { getDocsForCampaign, upsertDoc } from "@/db/docs";
import { saveConflicts } from "@/db/conflicts";
import { checkBatchIngest } from "@/lib/claude";
import { normalizeAndHash, recordIngestedNote } from "@/db/ingested-notes";
import { validatePostIngest } from "@/lib/validate-ingest";
import { GOLD_COSTS } from "@/lib/quota";
import pool from "@/db/client";

const DEDUP_ENABLED = process.env.INGEST_DEDUP_ENABLED === "true";
const VALIDATION_ENABLED = process.env.INGEST_VALIDATION_ENABLED === "true";

// Cada check consulta Anthropic — puede haber varios batches pendientes.
export const maxDuration = 120;

interface JobRow {
  id: string;
  batch_id: string;
  custom_id: string;
  filename: string | null;
  raw_text: string;
  status: string;
  created_at: Date;
  completed_at: Date | null;
}

interface JobOut {
  custom_id: string;
  filename: string | null;
  status: "processing" | "done" | "failed";
  created_at: string;
  completed_at: string | null;
  just_completed?: { updated_files: string[]; conflicts: number };
}

function uniqueFilePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

async function updateMatchingUploadStatus(
  campaignId: string,
  userId: string,
  rawText: string,
  filename: string | null,
  status: "done" | "failed"
) {
  await pool.query(
    `WITH target AS (
       SELECT id
       FROM uploads
       WHERE campaign_id = $1
         AND user_id = $2
         AND raw_text = $3
         AND status = 'processing'
         AND ((filename = $4) OR (filename IS NULL AND $4 IS NULL))
       ORDER BY created_at DESC
       LIMIT 1
     )
     UPDATE uploads
     SET status = $5
     WHERE id IN (SELECT id FROM target)`,
    [campaignId, userId, rawText, filename, status]
  );
}

/**
 * POST /api/ingest/batch/check  body: { campaign_id }
 * Lista los últimos batch jobs del usuario para esa campaña y, para los
 * que estén 'processing', consulta Anthropic y aplica resultados si ya terminaron.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { campaign_id } = await req.json();
  if (!campaign_id)
    return NextResponse.json({ error: "campaign_id requerido" }, { status: 400 });

  const member = await getCampaignById(campaign_id, session.user.id);
  if (!member)
    return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const { rows: jobs } = await pool.query<JobRow>(
    `SELECT id, batch_id, custom_id, filename, raw_text, status, created_at, completed_at
     FROM batch_jobs
     WHERE campaign_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT 10`,
    [campaign_id, session.user.id]
  );

  if (jobs.length === 0) return NextResponse.json({ jobs: [] });

  const hasPending = jobs.some((j) => j.status === "processing");
  const docs = hasPending ? await getDocsForCampaign(campaign_id) : [];

  const output: JobOut[] = [];

  for (const job of jobs) {
    if (job.status !== "processing") {
      output.push({
        custom_id: job.custom_id,
        filename: job.filename,
        status: job.status as "done" | "failed",
        created_at: job.created_at.toISOString(),
        completed_at: job.completed_at?.toISOString() ?? null,
      });
      continue;
    }

    try {
      const check = await checkBatchIngest(job.batch_id, job.custom_id, docs);

      if (check.status === "processing") {
        output.push({
          custom_id: job.custom_id,
          filename: job.filename,
          status: "processing",
          created_at: job.created_at.toISOString(),
          completed_at: null,
        });
        continue;
      }

      if (check.status === "failed" || !check.result) {
        await pool.query(
          `UPDATE batch_jobs SET status = 'failed', completed_at = NOW() WHERE id = $1`,
          [job.id]
        );
        await updateMatchingUploadStatus(campaign_id, session.user.id, job.raw_text, job.filename, "failed");
        output.push({
          custom_id: job.custom_id,
          filename: job.filename,
          status: "failed",
          created_at: job.created_at.toISOString(),
          completed_at: new Date().toISOString(),
        });
        continue;
      }

      if (VALIDATION_ENABLED) {
        const validation = validatePostIngest(check.result.updates);
        if (!validation.ok) {
          console.error("Batch ingest validation failed:", job.id, validation.errors);
          await pool.query(
            `UPDATE batch_jobs SET status = 'failed', completed_at = NOW() WHERE id = $1`,
            [job.id]
          );
          await updateMatchingUploadStatus(campaign_id, session.user.id, job.raw_text, job.filename, "failed");
          output.push({
            custom_id: job.custom_id,
            filename: job.filename,
            status: "failed",
            created_at: job.created_at.toISOString(),
            completed_at: new Date().toISOString(),
          });
          continue;
        }
      }

      for (const update of check.result.updates) {
        await upsertDoc(campaign_id, update.file_path, update.content, session.user.id);
      }
      await saveConflicts(campaign_id, check.result.conflicts, session.user.id);

      await pool.query(
        `UPDATE batch_jobs SET status = 'done', completed_at = NOW() WHERE id = $1`,
        [job.id]
      );
      await updateMatchingUploadStatus(campaign_id, session.user.id, job.raw_text, job.filename, "done");

      if (DEDUP_ENABLED) {
        await recordIngestedNote(campaign_id, normalizeAndHash(job.raw_text.trim()), null);
      }

      pool
        .query(
          `INSERT INTO usage_logs (user_id, campaign_id, operation, token_count, cache_creation_tokens, cache_read_tokens, model, gold_cost)
           VALUES ($1, $2, 'ingest_batch', $3, $4, $5, $6, $7)`,
          [
            session.user.id,
            campaign_id,
            check.result.input_tokens + check.result.output_tokens,
            check.result.cache_creation_tokens,
            check.result.cache_read_tokens,
            check.result.model,
            GOLD_COSTS.ingest_batch,
          ]
        )
        .catch(() => {});

      output.push({
        custom_id: job.custom_id,
        filename: job.filename,
        status: "done",
        created_at: job.created_at.toISOString(),
        completed_at: new Date().toISOString(),
        just_completed: {
          updated_files: uniqueFilePaths(check.result.updates.map((u) => u.file_path)),
          conflicts: check.result.conflicts.length,
        },
      });
    } catch (err) {
      console.error("Error comprobando batch", job.id, err);
      output.push({
        custom_id: job.custom_id,
        filename: job.filename,
        status: "processing",
        created_at: job.created_at.toISOString(),
        completed_at: null,
      });
    }
  }

  return NextResponse.json({ jobs: output });
}
