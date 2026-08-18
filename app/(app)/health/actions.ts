"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import { createAdminClient } from "@/lib/supabase/admin";
import { embeddingModel } from "@/lib/embeddings";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

// QA sweep 2026-08-18 — until now there was no way, anywhere in the app, to
// retry a queue row that had exhausted MAX_ATTEMPTS. `failed` was terminal,
// so /api/health's `degraded` was a latch: dev had been stuck there since
// 2026-08-09 and no amount of the system recovering could have cleared it.
//
// Access matches the rest of this page: any authenticated user, since no
// admin/role concept exists yet (T2.1 introduced workspaces, not roles) —
// the same caveat already documented on the page component. The underlying
// requeue_failed_queue_rows() validates the table name against a fixed
// allowlist and skips rows whose experiment is soft-deleted, so the blast
// radius of a stray click is "some embeddings get recomputed".
export async function requeueFailedAction(
  table: "evidence_chunks" | "index_jobs" | "file_jobs"
): Promise<ActionResult> {
  try {
    await requireUser();
    // The pollers run under the service role and these rows have no
    // per-user RLS story, so the admin client is the right caller here —
    // consistent with how every other read on this page is made.
    const admin = createAdminClient();
    const { error } = await admin.rpc("requeue_failed_queue_rows", { p_table: table });
    if (error) return toActionResult("requeueFailed", error);
  } catch (e) {
    return toActionResult("requeueFailed", e);
  }

  revalidatePath("/health");
  return { ok: true };
}

// Re-embeds every chunk whose stored embedding_model is not the one now in
// use. Needed because switching AI_PROVIDER changes the embedding model
// without invalidating anything: the old vectors keep the same dimension, so
// pgvector compares them without complaint and semantic search just quietly
// stops matching. Only the poller does the actual work — this simply moves
// the rows back to 'pending'.
export async function reindexStaleEmbeddingsAction(): Promise<ActionResult> {
  try {
    await requireUser();
    const admin = createAdminClient();
    const { error } = await admin.rpc("requeue_stale_embedding_chunks", {
      p_active_model: embeddingModel(),
    });
    if (error) return toActionResult("reindexStaleEmbeddings", error);
  } catch (e) {
    return toActionResult("reindexStaleEmbeddings", e);
  }

  revalidatePath("/health");
  return { ok: true };
}
