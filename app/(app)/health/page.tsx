import {
  getHealthSnapshot,
  getFailedIndexJobs,
  getIndexVersionStatus,
  getEvidenceChunkIndexStatus,
  getFailedEvidenceChunks,
  getRecentAiErrors,
  BACKUP_TEST_STATUS,
} from "@/lib/health/service";
import { RequeueFailedButton } from "@/components/requeue-failed-button";
import { ReindexEmbeddingsButton } from "@/components/reindex-embeddings-button";
import { requeueFailedAction, reindexStaleEmbeddingsAction } from "./actions";

// Provider errors arrive as whole JSON bodies and repeat verbatim across
// every row that failed in the same incident — 107 identical truncated
// Gemini 429 blobs made this page unreadable. Show each message once with a
// count instead.
function groupByError<T extends { lastError: string | null }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = (row.lastError ?? "no error message").slice(0, 160);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()];
}

// T0.10 — any authenticated user can see this (no admin/role concept exists
// yet; that's T2.1's job). Gated by the (app) layout's existing auth check.
export default async function HealthPage() {
  const [snapshot, failedJobs, indexVersion, chunkIndex, failedChunks, aiErrors] = await Promise.all([
    getHealthSnapshot(),
    getFailedIndexJobs(),
    getIndexVersionStatus(),
    getEvidenceChunkIndexStatus(),
    getFailedEvidenceChunks(),
    getRecentAiErrors(),
  ]);

  return (
    <div>
      <span className="eyebrow">System health</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        Health &amp; index status
      </h2>

      <div className="stat-grid">
        <div className="stat glass">
          <div className="num">{snapshot.status.toUpperCase()}</div>
          <div className="lbl">Overall status</div>
        </div>
        <div className="stat glass">
          <div className="num">{snapshot.indexJobs.pending}</div>
          <div className="lbl">Index jobs pending</div>
        </div>
        <div className="stat glass">
          <div className="num">{snapshot.indexJobs.failed}</div>
          <div className="lbl">Index jobs failed</div>
        </div>
        <div className="stat glass">
          <div className="num">{snapshot.evidenceChunks.pending}</div>
          <div className="lbl">Evidence chunks pending</div>
        </div>
        <div className="stat glass">
          <div className="num">{snapshot.evidenceChunks.failed}</div>
          <div className="lbl">Evidence chunks failed</div>
        </div>
        <div className="stat glass">
          <div className="num">{Math.round(snapshot.ai.recentErrorRate * 100)}%</div>
          <div className="lbl">
            AI error rate · last {snapshot.ai.windowHours} h
            {snapshot.ai.recentSampleSize === 0
              ? " (no requests)"
              : ` (${snapshot.ai.recentSampleSize} requests)`}
          </div>
        </div>
      </div>

      {snapshot.embeddings.staleChunks > 0 && (
        <div className="obs-box glass" style={{ marginTop: 20, borderColor: "var(--amber)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h4 style={{ margin: 0 }}>Semantic search is degraded</h4>
            <ReindexEmbeddingsButton action={reindexStaleEmbeddingsAction} />
          </div>
          <p style={{ marginBottom: 4 }}>
            <strong>{snapshot.embeddings.staleChunks}</strong> chunk
            {snapshot.embeddings.staleChunks === 1 ? " is" : "s are"} embedded with a different model
            than the one in use ({snapshot.embeddings.activeModel}).
          </p>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            Vectors from two models still compare without error when their dimensions match, so
            nothing fails loudly — those records simply stop matching any question and quietly
            disappear from semantic search. Re-indexing re-embeds them with the current model.
          </p>
        </div>
      )}

      <div className="obs-box glass" style={{ marginTop: 20 }}>
        <h4>Evidence chunk index</h4>
        <p>
          Model: {chunkIndex.model ?? "—"} · Dimensions: {chunkIndex.dimensions ?? "—"} · Version:{" "}
          {chunkIndex.embeddingVersion ?? "—"}
        </p>
        <p>
          {chunkIndex.totalChunks} chunks total —{" "}
          {Object.entries(chunkIndex.byStatus)
            .map(([status, count]) => `${count} ${status}`)
            .join(", ") || "none yet"}
        </p>
        <p className="muted">
          By source:{" "}
          {Object.entries(chunkIndex.bySourceType)
            .map(([type, count]) => `${type}: ${count}`)
            .join(", ") || "—"}
        </p>
        <p className="muted">
          Indexed range: {chunkIndex.indexedAtRange.earliest ?? "—"} →{" "}
          {chunkIndex.indexedAtRange.latest ?? "—"}
        </p>
        <p className="muted" style={{ fontSize: 12 }}>
          Raw index composition — counts every row, including chunks belonging to deleted
          experiments. The &ldquo;evidence chunks failed&rdquo; tile above deliberately excludes
          those, so the two numbers differ by design.
        </p>
      </div>

      <div className="obs-box glass" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h4 style={{ margin: 0 }}>Failed evidence chunks</h4>
          {failedChunks.length > 0 && (
            <RequeueFailedButton table="evidence_chunks" label="Retry all" action={requeueFailedAction} />
          )}
        </div>
        {failedChunks.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 12.5 }}>
              Chunks whose experiment has been deleted are excluded — they are not actionable and
              would otherwise pin the overall status to degraded forever.
            </p>
            {groupByError(failedChunks).map(([message, rows]) => (
              <div key={message} style={{ marginTop: 10 }}>
                <p style={{ margin: 0, fontSize: 13 }}>
                  <strong>{rows.length}×</strong> {message}
                </p>
                <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                  {rows.map((c) => `${c.sourceType}/${c.sourceId} (${c.attempts} attempts)`).join(", ")}
                </p>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="obs-box glass" style={{ marginTop: 20 }}>
        <h4>Embedding index (legacy, retired by T3.1)</h4>
        <p>
          Model: {indexVersion.model ?? "—"} · Dimensions: {indexVersion.dimensions ?? "—"}
        </p>
        <p>
          {indexVersion.indexedCount} / {indexVersion.totalExperiments} experiments indexed
        </p>
        <p className="muted">Historical snapshot only — no longer written to; superseded by the evidence chunk index above.</p>
      </div>

      <div className="obs-box glass" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h4 style={{ margin: 0 }}>Failed index jobs (legacy, retired by T3.1)</h4>
          {failedJobs.length > 0 && (
            <RequeueFailedButton table="index_jobs" label="Retry all" action={requeueFailedAction} />
          )}
        </div>
        {failedJobs.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          groupByError(failedJobs).map(([message, rows]) => (
            <div key={message} style={{ marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                <strong>{rows.length}×</strong> {message}
              </p>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                {rows.map((j) => `${j.experimentId} (${j.attempts} attempts)`).join(", ")}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="obs-box glass" style={{ marginTop: 20 }}>
        <h4>Recent AI errors</h4>
        {aiErrors.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul>
            {aiErrors.map((e, i) => (
              <li key={i}>
                {e.endpoint} · {e.model ?? "—"} ·{" "}
                {e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="obs-box glass" style={{ marginTop: 20 }}>
        <h4>Backup restore test</h4>
        <p>
          {BACKUP_TEST_STATUS.lastTestedAt
            ? `Last tested: ${BACKUP_TEST_STATUS.lastTestedAt}`
            : "Not yet run."}
        </p>
        <p className="muted">{BACKUP_TEST_STATUS.note}</p>
      </div>
    </div>
  );
}
