// T3.7 — the Experiment Planning Crew. §19.1's four blocks modelled directly
// as the data structure (spec D2), so "did we comply with §19.1" is a
// type-level question, not a prompt-quality one. rawSource is readonly and
// no Agent's return type includes it — the coordinator's merge logic never
// reads it off an agent's result even at runtime, so a compile-time
// guarantee and a runtime one both hold.

export type UnresolvedItem = {
  field: string;
  issue: string;
  candidates: string[];
};

export type Recommendation = {
  field: string;
  suggestion: string;
  rationale: string;
};

export type PlanFields = {
  scientific_question: string | null;
  rationale: string | null;
  hypothesis: string | null;
  primary_outcomes: string | null;
  secondary_outcomes: string | null;
  independent_variables: string | null;
  controlled_variables: string | null;
  data_analysis_plan: string | null;
  risks: string | null;
  experiment_type: string | null;
  replicate_kind: string | null;
  legacy_codes: string[];
};

export const EMPTY_PLAN_FIELDS: PlanFields = {
  scientific_question: null,
  rationale: null,
  hypothesis: null,
  primary_outcomes: null,
  secondary_outcomes: null,
  independent_variables: null,
  controlled_variables: null,
  data_analysis_plan: null,
  risks: null,
  experiment_type: null,
  replicate_kind: null,
  legacy_codes: [],
};

export type AgentName = "intake" | "design" | "controls" | "critic";

export type FieldProvenance = Partial<Record<keyof PlanFields, AgentName>>;

export type CrewDraft = {
  readonly rawSource: string;
  structured: PlanFields;
  unresolved: UnresolvedItem[];
  normalization: Recommendation[];
  provenance: FieldProvenance;
  // D6 — an agent that fails validation even after one retry is recorded
  // here explicitly; the run continues, the UI shows the gap.
  failedAgents: AgentName[];
};

export type CrewContext = {
  projectId: string | null;
  // Pre-formatted, T3.5-hardened evidence blocks ready to interpolate —
  // built once by the coordinator (retrieval is best-effort; empty string
  // when off or when nothing relevant was found).
  groundingText: string;
};

// D2 — an agent may only contribute to these three fields; rawSource is
// structurally absent from the return type. `structured` is a PARTIAL
// PlanFields (each individual field optional, not just the whole object) —
// an agent only fills the subset of fields it's responsible for.
export type AgentResult = {
  structured?: Partial<PlanFields>;
  unresolved?: UnresolvedItem[];
  normalization?: Recommendation[];
};

export type Agent = (draft: Readonly<CrewDraft>, ctx: CrewContext) => Promise<AgentResult | null>;
