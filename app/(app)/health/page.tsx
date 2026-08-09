import {
  getHealthSnapshot,
  getFailedIndexJobs,
  getIndexVersionStatus,
  getEvidenceChunkIndexStatus,
  getFailedEvidenceChunks,
  getRecentAiErrors,
  BACKUP_TEST_STATUS,
} from "@/lib/health/service";

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
          <div className="lbl">Recent AI error rate ({snapshot.ai.recentSampleSize} sampled)</div>
        </div>
      </div>

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
      </div>

      <div className="obs-box glass" style={{ marginTop: 20 }}>
        <h4>Failed evidence chunks</h4>
        {failedChunks.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul>
            {failedChunks.map((c) => (
              <li key={c.id}>
                {c.sourceType}/{c.sourceId} — {c.attempts} attempts — {c.lastError ?? "no error message"}
              </li>
            ))}
          </ul>
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
        <h4>Failed index jobs (legacy, retired by T3.1)</h4>
        {failedJobs.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul>
            {failedJobs.map((j) => (
              <li key={j.experimentId}>
                {j.experimentId} — {j.attempts} attempts — {j.lastError ?? "no error message"}
              </li>
            ))}
          </ul>
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
