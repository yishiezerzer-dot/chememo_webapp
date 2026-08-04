import type { Experiment, QuantityKind } from "@/lib/types";
import type { RelationshipView } from "@/lib/relationships/service";
import type { TaskView } from "@/lib/tasks/service";
import type { StepDetail } from "@/lib/experiment-steps/service";
import type { TimelineEntry } from "@/lib/experiments/timeline";
import { toStandardFieldName } from "@/lib/quantities/convert";

export type ExperimentExportInput = {
  experiment: Experiment;
  projectLabel: string | null;
  ownerName: string | null;
  protocolVersionLabel: string | null;
  quantityKinds: QuantityKind[];
  relationships: RelationshipView[];
  tasks: TaskView[];
  stepDetails: StepDetail[];
  revisions: TimelineEntry[];
};

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fmtDateTime = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "");
const yaml = (v: string | null) => (v ? `"${v.replace(/"/g, '\\"')}"` : "");

// T1.11 D1-D7 — a single experiment rendered against §20.2's Experiment
// master template: every populated field under its real standard name where
// one exists (D3/D6), sections with no backing entity omitted from the body
// and named once in the closing callout instead of silently dropped (D4),
// and a few sections the standard's own template predates (relationships,
// tasks, deviations, a merged execution/change log — D5).
export function buildExperimentMarkdown(input: ExperimentExportInput): string {
  const { experiment: e } = input;
  const lines: string[] = [];

  lines.push("---");
  lines.push(`title: ${yaml(e.name)}`);
  lines.push("type: experiment");
  lines.push(`experiment_id: ${e.id}`);
  lines.push(input.projectLabel ? `project: "[[${input.projectLabel}]]"` : "project:");
  lines.push(`status: ${e.status ?? ""}`);
  lines.push(`owner: ${yaml(input.ownerName)}`);
  lines.push("collaborators: []");
  lines.push(`created: ${fmtDate(e.created_at)}`);
  lines.push(`planned_start: ${fmtDate(e.planned_start_at)}`);
  lines.push(`actual_start: ${fmtDate(e.started_at)}`);
  lines.push(`planned_end: ${fmtDate(e.planned_end_at)}`);
  lines.push(`actual_end: ${fmtDate(e.completed_at)}`);
  lines.push(input.protocolVersionLabel ? `protocol_version: "[[${input.protocolVersionLabel}]]"` : "protocol_version:");
  lines.push("tags: [experiment]");
  lines.push("---", "", `# ${e.name}`, "");

  const section = (heading: string, body: string | null) => {
    if (!body) return;
    lines.push(`## ${heading}`, "", body, "");
  };

  section("Scientific question", e.scientific_question);
  section("Rationale", e.rationale);
  section("Hypothesis", e.hypothesis);
  section("Primary outcome", e.primary_outcome);
  section("Secondary outcomes", e.secondary_outcomes);

  if (e.independent_variables || e.controlled_variables) {
    lines.push("## Variables", "");
    if (e.independent_variables) lines.push("### Independent variables", "", e.independent_variables, "");
    if (e.controlled_variables) lines.push("### Controlled variables", "", e.controlled_variables, "");
  }

  const kindByKey = new Map(input.quantityKinds.map((k) => [k.key, k]));
  const quantityEntries = Object.entries(e.quantities);
  if (quantityEntries.length > 0) {
    lines.push("## Planned conditions", "", "| Field | Value | Unit |", "|---|---:|---|");
    for (const [key, q] of quantityEntries) {
      const kind = kindByKey.get(key);
      if (!kind) {
        lines.push(`| ${key} (no standard mapping) | ${q.value} | ${q.unit_code} |`);
        continue;
      }
      try {
        const converted = toStandardFieldName(kind, q.value, q.unit_code);
        const [fieldName, value] = Object.entries(converted)[0];
        lines.push(`| ${fieldName} | ${value} | ${kind.canonical_unit_code} |`);
      } catch {
        lines.push(`| ${kind.standard_field_name} | ${q.value} | ${q.unit_code} (unconverted) |`);
      }
    }
    lines.push("");
  }

  if (e.controls.length > 0) {
    lines.push("## Controls", "");
    for (const c of e.controls) lines.push(`- [${c.checked ? "x" : " "}] ${c.label}`);
    lines.push("");
  }

  if (e.sample_matrix.length > 0) {
    lines.push(
      "## Sample matrix",
      "",
      "| Sample ID | Vial label | Legacy code | Batch | Replicate | Sample type | Composition | Amounts | Ratio | Treatment | Planned analyses | Status | Per-sample conditions |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|"
    );
    for (const r of e.sample_matrix) {
      const composition = [r.component_1, r.component_2].filter(Boolean).join(" + ");
      const amounts = [r.amount_1, r.amount_2].filter(Boolean).join(" / ");
      const conditions = [
        r.reaction_mode,
        r.temperature && `${r.temperature}`,
        r.duration && `${r.duration}`,
        r.atmosphere,
        r.initial_volume && `${r.initial_volume}`,
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `| ${r.sample_id} | ${r.vial_label} | ${r.legacy_code} | ${r.batch} | ${r.replicate} | ${r.sample_type} | ${composition} | ${amounts} | ${r.ratio} | ${r.treatment} | ${r.planned_analysis} | ${r.status} | ${conditions} |`
      );
    }
    lines.push("");
  }

  if (input.protocolVersionLabel) {
    lines.push("## Protocol", "", `- Protocol: [[${input.protocolVersionLabel}]]`, "");
  }

  section("Data-analysis plan", e.planned_analyses);

  if (e.acceptance_criteria) {
    lines.push("## Acceptance criteria", "", e.acceptance_criteria);
    if (e.acceptance_criteria_locked_at) lines.push("", `_Locked ${fmtDateTime(e.acceptance_criteria_locked_at)}._`);
    lines.push("");
  }

  section("Risks and likely failure modes", e.risks_failure_modes);
  section("Planned sample storage", e.sample_storage_plan);

  if (input.tasks.length > 0) {
    lines.push("## Task assignment", "", "| Task | Person | Due | Status | Dependency |", "|---|---|---|---|---|");
    for (const t of input.tasks) {
      lines.push(
        `| ${t.task_type === "review" ? "Review: " : ""}${t.title} | ${t.assigneeName ?? "—"} | ${fmtDate(t.due_at)} | ${t.status} | ${t.blocker_note ?? ""} |`
      );
    }
    lines.push("");
  }

  const logRows: { at: string; event: string; note: string }[] = [];
  for (const sd of input.stepDetails) {
    if (sd.step.started_at) logRows.push({ at: sd.step.started_at, event: "Step started", note: sd.protocolStep.instruction });
    for (const obs of sd.observations) logRows.push({ at: obs.observed_at, event: "Observation", note: obs.note });
    if (sd.step.completed_at) logRows.push({ at: sd.step.completed_at, event: "Step completed", note: sd.protocolStep.instruction });
  }
  logRows.sort((a, b) => a.at.localeCompare(b.at));
  if (logRows.length > 0) {
    lines.push("## Chronological execution log", "", "| Timestamp | Event | Note |", "|---|---|---|");
    for (const r of logRows) lines.push(`| ${fmtDateTime(r.at)} | ${r.event} | ${r.note} |`);
    lines.push("");
  }

  const deviations = input.stepDetails.flatMap((sd) => sd.deviations);
  if (deviations.length > 0) {
    lines.push("## Deviations", "");
    for (const d of deviations) {
      lines.push(`- **${d.category}** (${fmtDate(d.reported_at)}): ${d.what_happened}`);
      if (d.corrective_action) lines.push(`  - Corrective action: ${d.corrective_action}`);
    }
    lines.push("");
  }

  section("Conclusions", e.conclusion);
  section("Follow-up experiments", e.next_steps);

  if (input.relationships.length > 0) {
    lines.push("## Relationships", "");
    for (const r of input.relationships) lines.push(`- ${r.label} [[${r.otherExperiment.id}]] (${r.otherExperiment.name})`);
    lines.push("");
  }

  const revisionEntries = input.revisions.filter((r): r is Extract<TimelineEntry, { kind: "revision" }> => r.kind === "revision");
  if (revisionEntries.length > 0) {
    lines.push("## Change log", "", "| Date | Person | Change |", "|---|---|---|");
    for (const rev of revisionEntries) {
      const changes = rev.diff.map((d) => d.label).join(", ");
      lines.push(`| ${fmtDate(rev.created_at)} | ${rev.actorName} | ${changes} |`);
    }
    lines.push("");
  }

  const unmapped: string[] = [];
  if (e.notes) unmapped.push(`**Notes:** ${e.notes}`);
  if (e.observations) unmapped.push(`**Observations:** ${e.observations}`);
  if (e.reaction_type) unmapped.push(`**Reaction type:** ${e.reaction_type}`);
  if (unmapped.length > 0) {
    lines.push("## Additional notes (no standard-section mapping)", "", ...unmapped, "");
  }

  lines.push(
    "> [!info] Not yet tracked in ChemMemo (Tier 2/3 work)",
    "> Batches, Materials and stocks, Calculation record, Replicate strategy, Measured variables, Interpretation, Limitations, Sample locations, Analyses.",
    ""
  );

  return lines.join("\n");
}
