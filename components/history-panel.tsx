import type { Experiment, ExperimentRevision } from "@/lib/types";

const FIELDS: { key: keyof Experiment; label: string }[] = [
  { key: "name", label: "name" },
  { key: "date", label: "date" },
  { key: "researcher", label: "researcher" },
  { key: "project", label: "project" },
  { key: "reaction_type", label: "reaction type" },
  { key: "compounds", label: "compounds" },
  { key: "metals", label: "metals" },
  { key: "ph", label: "pH" },
  { key: "concentration", label: "concentration" },
  { key: "temperature", label: "temperature" },
  { key: "cycles", label: "cycles" },
  { key: "methods", label: "methods" },
  { key: "mz", label: "m/z" },
  { key: "observations", label: "observations" },
  { key: "notes", label: "notes" },
  { key: "deleted_at", label: "deleted" },
];

const norm = (v: unknown): string => (Array.isArray(v) ? v.join("|") : v == null ? "" : String(v));

// Fields that differ between a snapshot and the state that followed it.
function changedFields(before: Experiment, after: Experiment): string[] {
  return FIELDS.filter((f) => norm(before[f.key]) !== norm(after[f.key])).map((f) => f.label);
}

const fmt = (iso: string) => iso.slice(0, 16).replace("T", " ");

// Each revision is the PRIOR state before an edit; the edit that created it
// produced the next-newer state (or the current record for the latest one).
export function HistoryPanel({
  current,
  revisions,
}: {
  current: Experiment;
  revisions: ExperimentRevision[];
}) {
  if (revisions.length === 0) return null;
  return (
    <div className="panel glass" style={{ marginTop: 16 }}>
      <h4 style={{ fontFamily: "var(--display)", margin: "0 0 12px" }}>
        History · {revisions.length} edit{revisions.length === 1 ? "" : "s"}
      </h4>
      <div className="activity">
        {revisions.map((r, i) => {
          const after = i === 0 ? current : revisions[i - 1].snapshot;
          const changed = changedFields(r.snapshot, after);
          return (
            <div key={r.id} className="act-row">
              <span className="act-dot"></span>
              <span style={{ fontSize: 13 }}>
                {changed.length ? `Changed ${changed.join(", ")}` : "Edited"}
              </span>
              <time
                style={{
                  marginLeft: "auto",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--ink-mute)",
                  whiteSpace: "nowrap",
                  flex: "none",
                }}
              >
                {fmt(r.created_at)}
              </time>
            </div>
          );
        })}
      </div>
    </div>
  );
}
