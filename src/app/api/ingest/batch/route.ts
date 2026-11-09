import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDocsForCampaign, upsertDoc } from "@/db/docs";
import { saveConflicts } from "@/db/conflicts";
import { checkBatchIngest } from "@/lib/claude";
import { GOLD_COSTS } from "@/lib/quota";
import pool from "@/db/client";

interface JobRow {
  campaign_id: string;
  raw_text: string;
  filename: string | null;
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
 * GET /api/ingest/batch?batch_id=...&custom_id=...
 * Comprueba el estado de un batch de ingestión.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const batchId = url.searchParams.get("batch_id");
  const customId = url.searchParams.get("custom_id");

  if (!batchId || !customId) {
    return NextResponse.json(
      { error: "batch_id y custom_id son requeridos" },
      { status: 400 }
    );
  }

  // Verificar que el batch pertenece al usuario
  const { rows: jobs } = await pool.query<JobRow>(
    `SELECT campaign_id, raw_text, filename FROM batch_jobs
     WHERE batch_id = $1 AND custom_id = $2 AND user_id = $3`,
    [batchId, customId, session.user.id]
  );

  if (jobs.length === 0) {
    return NextResponse.json({ error: "Batch no encontrado" }, { status: 404 });
  }

  const campaignId = jobs[0].campaign_id;
  const docs = await getDocsForCampaign(campaignId);
  const check = await checkBatchIngest(batchId, customId, docs);

  if (check.status === "processing") {
    return NextResponse.json({ status: "processing" });
  }

  if (check.status === "failed" || !check.result) {
    await pool.query(
      `UPDATE batch_jobs SET status = 'failed', completed_at = NOW()
       WHERE batch_id = $1 AND custom_id = $2`,
      [batchId, customId]
    );
    await updateMatchingUploadStatus(
      campaignId,
      session.user.id,
      jobs[0].raw_text,
      jobs[0].filename,
      "failed"
    );
    return NextResponse.json({ status: "failed" });
  }

  // Aplicar updates
  for (const update of check.result.updates) {
    await upsertDoc(campaignId, update.file_path, update.content, session.user.id);
  }

  await saveConflicts(campaignId, check.result.conflicts, session.user.id);

  await pool.query(
    `UPDATE batch_jobs SET status = 'done', completed_at = NOW()
     WHERE batch_id = $1 AND custom_id = $2`,
    [batchId, customId]
  );
  await updateMatchingUploadStatus(
    campaignId,
    session.user.id,
    jobs[0].raw_text,
    jobs[0].filename,
    "done"
  );

  // Registrar uso
  pool
    .query(
      `INSERT INTO usage_logs (user_id, campaign_id, operation, token_count, cache_creation_tokens, cache_read_tokens, gold_cost)
       VALUES ($1, $2, 'ingest_batch', $3, $4, $5, $6)`,
      [
        session.user.id,
        campaignId,
        check.result.input_tokens + check.result.output_tokens,
        check.result.cache_creation_tokens,
        check.result.cache_read_tokens,
        GOLD_COSTS.ingest_batch,
      ]
    )
    .catch(() => {});

  return NextResponse.json({
    status: "done",
    updated_files: uniqueFilePaths(check.result.updates.map((u) => u.file_path)),
    conflicts: check.result.conflicts.length,
  });
}
