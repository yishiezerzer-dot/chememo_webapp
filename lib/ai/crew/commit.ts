import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createExperiment, softDeleteExperiment } from "@/lib/experiments/service";
import { createProject } from "@/lib/projects/service";
import { isEmptyValue } from "@/lib/experiment-form-parse";
import { activeChatModel, isLlmEnabled, suggestFieldsForPlan, AI_SUGGESTIBLE_FIELDS, type SuggestibleField } from "@/lib/llm";
import { AppError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import type { ExperimentInput, ExperimentTemplateVersion } from "@/lib/types";
import type { CrewDraft, PersistedUnresolvedItem, PlanFields, UnresolvedItem } from "./types";
import { randomUUID } from "node:crypto";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// T3.8 — the crew's own version tag (bumped alongside real behavior changes,
// mirroring T3.4 D5's prompt_versions convention but for the crew as a whole
// rather than one prompt).
const CREW_VERSION = "1.0";

// T3.8's revalidated field mapping (spec's original "no translation layer"
// claim was wrong — see the spec's 2026-08-10 revalidation callout):
// primary_outcomes/risks (crew) rename to primary_outcome/risks_failure_modes
// (DB); everything else matches. experiment_type/replicate_kind/legacy_codes
// have no experiment-header column — experiment_type is used only to pick a
// template (see app/(app)/plan/commit-actions.ts), and replicate_kind/
// legacy_codes conceptually belong at the sample-matrix level (out of scope
// per D9), so they stay implicit in the preserved raw source.
const FIELD_MAP: Partial<Record<keyof PlanFields, keyof ExperimentInput>> = {
  scientific_question: "scientific_question",
  rationale: "rationale",
  hypothesis: "hypothesis",
  primary_outcomes: "primary_outcome",
  secondary_outcomes: "secondary_outcomes",
  independent_variables: "independent_variables",
  controlled_variables: "controlled_variables",
  data_analysis_plan: "data_analysis_plan",
  risks: "risks_failure_modes",
};

// Only these ExperimentInput fields are free text — §19.4's "TBD, never
// invent" filling only makes sense for them. A required-but-empty non-text
// field (ph, compounds, sample_matrix, ...) gets an unresolved item instead
// of a value that would violate its real type.
const TBD_FILLABLE_FIELDS = new Set<keyof ExperimentInput>([
  "scientific_question", "rationale", "hypothesis", "primary_outcome", "secondary_outcomes",
  "data_analysis_plan", "risks_failure_modes", "independent_variables", "controlled_variables",
  "researcher", "reaction_type", "observations", "notes", "next_steps",
  "planned_analyses", "sample_storage_plan", "conclusion",
]);

const EMPTY_INPUT: ExperimentInput = {
  name: "",
  date: null,
  researcher: null,
  project: null,
  reaction_type: null,
  compounds: [],
  metals: [],
  ph: null,
  cycles: null,
  methods: [],
  mz: [],
  observations: null,
  notes: null,
  scientific_question: null,
  rationale: null,
  hypothesis: null,
  primary_outcome: null,
  secondary_outcomes: null,
  data_analysis_plan: null,
  risks_failure_modes: null,
  conclusion: null,
  next_steps: null,
  acceptance_criteria: null,
  planned_start_at: null,
  planned_end_at: null,
  independent_variables: null,
  controlled_variables: null,
  sample_matrix: [],
  controls: [],
  protocol_version_id: null,
  planned_analyses: null,
  sample_storage_plan: null,
  quantities: {},
};

// D9 — instantiate from a template's defaults, overlaid with the crew's own
// captured content (more specific than a generic default), then D9's "never
// invent — TBD + unresolved item" for anything a required field still lacks.
// D3 — the crew never proposes acceptance criteria at all (T3.7 has no such
// output field), so every crew-authored draft always gets a static reminder
// rather than silently leaving §8.6 unaddressed.
export function buildCommitInput(
  draft: CrewDraft,
  name: string,
  template: ExperimentTemplateVersion | null
): { input: ExperimentInput; addedUnresolved: UnresolvedItem[] } {
  const mapped: Partial<ExperimentInput> = {};
  for (const [crewKey, dbKey] of Object.entries(FIELD_MAP) as [keyof PlanFields, keyof ExperimentInput][]) {
    const value = draft.structured[crewKey];
    if (typeof value === "string" && value.trim()) {
      (mapped as Record<string, unknown>)[dbKey] = value;
    }
  }

  const input: ExperimentInput = { ...EMPTY_INPUT, ...(template?.defaults ?? {}), ...mapped, name };

  const addedUnresolved: UnresolvedItem[] = [];
  for (const key of template?.required_fields ?? []) {
    const current = (input as Record<string, unknown>)[key];
    if (!isEmptyValue(current)) continue;
    if (TBD_FILLABLE_FIELDS.has(key)) {
      (input as Record<string, unknown>)[key] = "TBD";
      addedUnresolved.push({
        field: key,
        issue: "Required by the selected template; not determinable from the notes (marked TBD).",
        candidates: [],
      });
    } else {
      addedUnresolved.push({
        field: key,
        issue: "Required by the selected template but not determinable from the notes.",
        candidates: [],
      });
    }
  }

  addedUnresolved.push({
    field: "acceptance_criteria",
    issue: "No acceptance criteria proposed. Write these before starting the experiment (standard section 8.6).",
    candidates: [],
  });

  return { input, addedUnresolved };
}

// D1/D2/D5/D6/D7/D8 — the human already reviewed the plan on screen; this is
// the single "commit" step. createExperiment (EXISTS) is reused unchanged —
// no parallel insert, no service role, ExperimentInput has no status field at
// all so status='draft' is structurally guaranteed regardless of caller.
// The provenance insert is a second statement, not a literal single SQL
// transaction (a deliberate, disclosed deviation from the spec's "one
// security invoker function" framing — that would mean re-implementing
// createExperiment's id-minting/index-job logic in raw SQL, directly
// contradicting D6's "reuse createExperiment, no parallel insert"). If the
// provenance insert fails, the just-created draft is soft-deleted (drafts are
// the one state T1.1 D12 allows deleting) so no half-written, provenance-less
// crew record is ever left for a scientist to find.
export async function commitCrewDraft(
  supabase: Supabase,
  userId: string,
  workspaceId: string,
  draft: CrewDraft,
  opts: {
    name: string;
    templateVersionId: string | null;
    template: ExperimentTemplateVersion | null;
    newProjectName: string | null; // D7 — non-null/non-empty only when the checkbox was checked
  }
): Promise<string> {
  const { input, addedUnresolved } = buildCommitInput(draft, opts.name, opts.template);

  // D7 — never silent: an unchecked/blank proposal always leaves project
  // null plus an explicit unresolved item, never a guessed assignment.
  //
  // Bug fix 2026-08-17: the crew's own unresolved items name fields using
  // PlanFields' vocabulary (e.g. "primary_outcomes", "risks"), not the DB's
  // (FIELD_MAP already renames these on `input` above but never touched
  // `unresolved` itself) — so "Resolve with AI" silently never matched the
  // AI_SUGGESTIBLE_FIELDS allowlist (DB-named) for exactly those two fields.
  // Apply the same rename here so every unresolved item's `field` uses the
  // real column name, same as `addedUnresolved`'s template-required items
  // already do.
  //
  // Bug fix 2026-08-18: every item also gets a stable uuid here, at the one
  // point where the final array is assembled. Nothing downstream may identify
  // an item by array position (shifts whenever an earlier item is resolved)
  // or by field name (not unique — the four agents each append findings
  // independently, so one field routinely appears several times). Both have
  // already shipped as wrong-item-cleared bugs. See migration
  // 20260828120000_unresolved_item_ids.sql.
  const unresolved: PersistedUnresolvedItem[] = [
    ...draft.unresolved.map((u) => {
      const dbField = FIELD_MAP[u.field as keyof PlanFields];
      return { ...u, field: dbField ?? u.field, id: randomUUID() };
    }),
    ...addedUnresolved.map((u) => ({ ...u, id: randomUUID() })),
  ];
  if (opts.newProjectName && opts.newProjectName.trim()) {
    input.project = await createProject(supabase, userId, workspaceId, opts.newProjectName.trim(), "#3ee0c4");
  } else {
    input.project = null;
    unresolved.push({ field: "project", issue: "No project assigned.", candidates: [], id: randomUUID() });
  }

  const experimentId = await createExperiment(supabase, userId, workspaceId, input, {
    templateVersionId: opts.templateVersionId,
  });

  const { error } = await supabase.from("experiment_crew_provenance").insert({
    experiment_id: experimentId,
    raw_source: draft.rawSource,
    unresolved,
    unresolved_open_count: unresolved.length,
    normalization: draft.normalization,
    crew_version: CREW_VERSION,
    prompt_versions: { intake: 1, design: 1, controls: 1, critic: 1 },
    model: activeChatModel(),
    created_by: userId,
  });

  if (error) {
    logError("crew/commit", "provenance insert failed, rolling back draft", { error });
    await softDeleteExperiment(supabase, experimentId).catch((e) =>
      logError("crew/commit", "rollback soft-delete also failed", { error: e })
    );
    throw new AppError("conflict", "Could not save the plan's provenance; the draft was not created.");
  }

  // AI Field Suggestions — "when they finish planning, suggest for areas they
  // didn't find in the user's prompt." Best-effort only: the scientist still
  // has to explicitly Agree to any of these (D3 — write-on-accept, same as
  // manually clicking "Resolve with AI" later) before anything is written, so
  // a failure here must never block draft creation, which has already fully
  // succeeded above. Scoped to the same D8 narrative-field allowlist as the
  // rest of the feature — a missing "controls"/"acceptance_criteria"/
  // "project" unresolved item has no AI-suggestible answer.
  if (isLlmEnabled()) {
    try {
      const suggestible = unresolved.filter((item) =>
        (AI_SUGGESTIBLE_FIELDS as readonly string[]).includes(item.field)
      );
      const targetFields = [...new Set(suggestible.map((item) => item.field))] as SuggestibleField[];

      if (targetFields.length > 0) {
        const suggestions = await suggestFieldsForPlan(input, draft.rawSource, targetFields);
        if (suggestions && suggestions.length > 0) {
          // One suggestion per field (D6 asks the model for one value per
          // field), but a field may have several checklist items. Attach it
          // to the first item of that field and to that item only — binding
          // it to the field itself would make one suggestion render against
          // every item sharing the field, which is precisely the defect this
          // change exists to remove. The remaining items keep their own
          // "Resolve with AI" button.
          const claimed = new Set<string>();
          const rows = suggestions
            .map((s) => {
              const match = suggestible.find((item) => item.field === s.field && !claimed.has(item.id));
              if (!match) return null;
              claimed.add(match.id);
              return {
                experiment_id: experimentId,
                field: s.field,
                suggested_value: s.suggestedValue,
                rationale: s.rationale,
                source: "crew_resolve" as const,
                unresolved_item_id: match.id,
                model: activeChatModel(),
                created_by: userId,
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

          if (rows.length > 0) {
            const { error: suggestionError } = await supabase.from("experiment_ai_suggestions").insert(rows);
            if (suggestionError) {
              logError("crew/commit", "plan-time suggestion insert failed (non-blocking)", { error: suggestionError });
            }
          }
        }
      }
    } catch (e) {
      logError("crew/commit", "plan-time suggestion generation failed (non-blocking)", { error: e });
    }
  }

  return experimentId;
}
