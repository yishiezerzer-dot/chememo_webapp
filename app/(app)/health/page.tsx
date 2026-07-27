import {
  getHealthSnapshot,
  getFailedIndexJobs,
  getIndexVersionStatus,
  getRecentAiErrors,
  BACKUP_TEST_STATUS,
} from "@/lib/health/service";

// T0.10 — any authenticated user can see this (no admin/role concept exists
// yet; that's T2.1's job). Gated by the (app) layout's existing auth check.
export default async function HealthPage() {
  const [snapshot, failedJobs, indexVersion, aiErrors] = await Promise.all([
    getHealthSnapshot(),
    getFailedIndexJobs(),
    getIndexVersionStatus(),
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
          <div className="num">{Math.round(snapshot.ai.recentErrorRate * 100)}%</div>
          <div className="lbl">Recent AI error rate ({snapshot.ai.recentSampleSize} sampled)</div>
        </div>
      </div>

      <div className="obs-box glass" style={{ marginTop: 20 }}>
        <h4>Embedding index</h4>
        <p>
          Model: {indexVersion.model ?? "—"} · Dimensions: {indexVersion.dimensions ?? "—"}
        </p>
        <p>
          {indexVersion.indexedCount} / {indexVersion.totalExperiments} experiments indexed
        </p>
      </div>

      <div className="obs-box glass" style={{ marginTop: 20 }}>
        <h4>Failed index jobs</h4>
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
