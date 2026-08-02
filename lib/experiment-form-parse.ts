import { METHOD_OPTIONS } from "@/lib/types";

// Shared by app/(app)/new/actions.ts and app/(app)/templates/actions.ts —
// extracted here (rather than exported from new/actions.ts) because a
// "use server" module may only export async server actions, and this is a
// plain synchronous parser both call sites need identically (T1.2).
export function parseExperimentForm(formData: FormData) {
  const str = (k: string) => {
    const v = (formData.get(k) as string | null)?.trim();
    return v ? v : null;
  };
  const list = (k: string) =>
    ((formData.get(k) as string | null) || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const numList = (k: string) => list(k).map((s) => Number(s));
  const num = (k: string) => {
    const v = str(k);
    return v === null ? null : Number(v);
  };
  const jsonList = (k: string) => {
    try {
      const v = JSON.parse((formData.get(k) as string | null) || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const jsonObject = (k: string) => {
    try {
      const v = JSON.parse((formData.get(k) as string | null) || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  };

  const methods = METHOD_OPTIONS.filter((m) => formData.get(`method:${m}`) === "on");

  return {
    name: str("name") ?? "",
    date: str("date"),
    researcher: str("researcher"),
    project: str("project"),
    reaction_type: str("reaction_type"),
    compounds: list("compounds"),
    metals: list("metals"),
    ph: num("ph"),
    cycles: num("cycles"),
    methods,
    mz: numList("mz"),
    observations: str("observations"),
    notes: str("notes"),
    scientific_question: str("scientific_question"),
    rationale: str("rationale"),
    hypothesis: str("hypothesis"),
    primary_outcome: str("primary_outcome"),
    secondary_outcomes: str("secondary_outcomes"),
    data_analysis_plan: str("data_analysis_plan"),
    risks_failure_modes: str("risks_failure_modes"),
    conclusion: str("conclusion"),
    next_steps: str("next_steps"),
    acceptance_criteria: str("acceptance_criteria"),
    planned_start_at: str("planned_start_at"),
    planned_end_at: str("planned_end_at"),
    independent_variables: str("independent_variables"),
    controlled_variables: str("controlled_variables"),
    // T1.5 D4 — protocol_version (the old free-text field) is likewise not
    // parsed here anymore; protocol_version_id (a picker, not free text) is.
    protocol_version_id: str("protocol_version_id"),
    planned_analyses: str("planned_analyses"),
    sample_storage_plan: str("sample_storage_plan"),
    sample_matrix: jsonList("sample_matrix"),
    controls: jsonList("controls"),
    // T1.4 D1/D4 — the new structured map. Note temperature/concentration
    // (the old free-text columns) are deliberately NOT parsed here anymore:
    // there's no form input for them post-T1.4, and including them as `null`
    // would silently wipe legacy text on every save. They're display-only
    // now, read straight from the loaded Experiment, never round-tripped
    // through ExperimentInput.
    quantities: jsonObject("quantities"),
  };
}

// T1.2 D4 — a template-required field is empty the same way the plain form
// treats it empty: null/blank string, or a zero-length array.
export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}
