import type { Experiment } from "@/lib/types";

// T1.8 D2 — an EXCLUSION set, not an allowlist: the previous history-panel
// hand-listed 16 columns and went stale the moment T1.1-T1.7 added dozens
// more. Anything not excluded here shows up automatically. Kept in sync with
// record_experiment_revision()'s own exclusion list (D1) so "what counts as
// a real change" means the same thing in the trigger and in the UI.
export const DIFF_EXCLUDED_KEYS: (keyof Experiment)[] = [
  "id",
  "owner_id",
  "created_at",
  "updated_at",
  "short_code",
  "search_vector",
  "locked_at",
  "completed_at",
  "completed_by",
  "reviewed_at",
  "reviewed_by",
  "acceptance_criteria_locked_at",
];

export type DiffField = {
  key: string;
  label: string;
  kind: "scalar" | "array" | "json";
  before: unknown;
  after: unknown;
  added?: string[];
  removed?: string[];
};

function labelFor(key: string): string {
  return key.replace(/_/g, " ");
}

function isPrimitiveArray(v: unknown[]): boolean {
  return v.every((x) => x === null || typeof x !== "object");
}

// T1.8 D3 — scalar fields diff as old->new; primitive arrays (compounds,
// metals, methods, mz) diff as added/removed; jsonb/object-array fields
// (sample_matrix, controls, quantities) get a changed/unchanged flag with
// both raw snapshots available, not a deep structural diff (see spec's
// out-of-scope note — the pragmatic cut for this pass).
export function diffExperiments(before: Experiment, after: Experiment): DiffField[] {
  const keys = (Object.keys(after) as (keyof Experiment)[]).filter(
    (k) => !DIFF_EXCLUDED_KEYS.includes(k)
  );
  const fields: DiffField[] = [];

  for (const key of keys) {
    const b = before[key];
    const a = after[key];

    if (Array.isArray(b) || Array.isArray(a)) {
      const bArr = (Array.isArray(b) ? b : []) as unknown[];
      const aArr = (Array.isArray(a) ? a : []) as unknown[];
      if (isPrimitiveArray(bArr) && isPrimitiveArray(aArr)) {
        const bStrs = bArr.map(String);
        const aStrs = aArr.map(String);
        const bSet = new Set(bStrs);
        const aSet = new Set(aStrs);
        const added = aStrs.filter((x) => !bSet.has(x));
        const removed = bStrs.filter((x) => !aSet.has(x));
        if (added.length === 0 && removed.length === 0) continue;
        fields.push({ key, label: labelFor(key), kind: "array", before: b, after: a, added, removed });
        continue;
      }
      if (JSON.stringify(bArr) === JSON.stringify(aArr)) continue;
      fields.push({ key, label: labelFor(key), kind: "json", before: b, after: a });
      continue;
    }

    if (b && typeof b === "object") {
      if (JSON.stringify(b) === JSON.stringify(a)) continue;
      fields.push({ key, label: labelFor(key), kind: "json", before: b, after: a });
      continue;
    }

    if (b === a) continue;
    fields.push({ key, label: labelFor(key), kind: "scalar", before: b, after: a });
  }

  return fields;
}
