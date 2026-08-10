"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ExperimentTemplate, Project } from "@/lib/types";
import type { CrewDraft, PlanFields } from "@/lib/ai/crew/types";
import { useToast } from "@/components/toast-provider";
import { createDraftExperimentFromPlan } from "@/app/(app)/plan/commit-actions";

function deriveDefaultName(draft: CrewDraft): string {
  const source = draft.structured.scientific_question || draft.rawSource;
  return source.trim().slice(0, 80);
}

const FIELD_LABELS: { key: keyof PlanFields; label: string }[] = [
  { key: "scientific_question", label: "Scientific question" },
  { key: "rationale", label: "Rationale" },
  { key: "hypothesis", label: "Hypothesis" },
  { key: "primary_outcomes", label: "Primary outcomes" },
  { key: "secondary_outcomes", label: "Secondary outcomes" },
  { key: "independent_variables", label: "Independent variables" },
  { key: "controlled_variables", label: "Controlled variables" },
  { key: "data_analysis_plan", label: "Data analysis plan" },
  { key: "risks", label: "Risks" },
  { key: "experiment_type", label: "Experiment type" },
  { key: "replicate_kind", label: "Replicate kind" },
];

const AGENT_LABEL: Record<string, string> = {
  intake: "Intake",
  design: "Design",
  controls: "Controls & Replicates",
  critic: "Critic",
};

function CopyButton({ text }: { text: string }) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        showToast("Copied to clipboard", "success");
      }}
    >
      Copy
    </button>
  );
}

export function PlanClient({ projects, templates }: { projects: Project[]; templates: ExperimentTemplate[] }) {
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [draft, setDraft] = useState<CrewDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = phase === "loading";

  const [confirming, setConfirming] = useState(false);
  const [commitName, setCommitName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [alsoCreateProject, setAlsoCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [commitError, setCommitError] = useState<string | null>(null);
  const [committing, startCommit] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  function openConfirm() {
    if (!draft) return;
    setCommitName(deriveDefaultName(draft));
    setTemplateId("");
    setAlsoCreateProject(false);
    setNewProjectName("");
    setCommitError(null);
    setConfirming(true);
  }

  function commit() {
    if (!draft || !commitName.trim()) return;
    startCommit(async () => {
      const res = await createDraftExperimentFromPlan(draft, {
        name: commitName.trim(),
        templateId: templateId || null,
        newProjectName: alsoCreateProject ? newProjectName.trim() || null : null,
      });
      // A successful commit redirects server-side and never returns here —
      // only a failure result reaches this line.
      if (!res.ok) {
        setCommitError(res.error);
      } else {
        showToast("Draft experiment created", "success");
        router.refresh();
      }
    });
  }

  async function run() {
    if (!notes.trim() || busy) return;
    setPhase("loading");
    setError(null);
    setDraft(null);
    try {
      const res = await fetch("/api/crew/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes, projectId: projectId || null }),
      });
      if (!res.ok) {
        setError(await res.text());
        setPhase("done");
        return;
      }
      setDraft((await res.json()) as CrewDraft);
      setPhase("done");
    } catch {
      setError("Something went wrong generating this plan. Please try again.");
      setPhase("done");
    }
  }

  const filledFields = draft
    ? FIELD_LABELS.filter(({ key }) => draft.structured[key])
    : [];
  const legacyCodes = draft?.structured.legacy_codes ?? [];

  return (
    <div>
      <div className="field">
        <label htmlFor="plan-notes">Rough bench notes</label>
        <textarea
          id="plan-notes"
          rows={8}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
          placeholder="Paste or type your rough notes for the experiment you're planning — reaction, conditions, what you're trying to learn…"
        />
      </div>

      <div className="field" style={{ maxWidth: 320 }}>
        <label htmlFor="plan-project">Project (optional)</label>
        <select
          id="plan-project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={busy}
        >
          <option value="">No project selected</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
          Choosing a project lets the crew resolve ambiguous abbreviations
          against this project&rsquo;s usage. Without one, ambiguous terms are
          left for you to clarify below.
        </p>
      </div>

      <button type="button" className="btn" disabled={!notes.trim() || busy} onClick={run} style={{ marginTop: 4 }}>
        {busy ? "Planning…" : "Run planning crew"}
      </button>

      <div role="status" aria-live="polite" style={{ marginTop: 14 }}>
        {phase === "loading" && (
          <p className="muted" style={{ fontSize: 12.5 }}>
            Running Intake, Design, Controls &amp; Replicates, and Critic
            agents over your notes…
          </p>
        )}
        {error && (
          <p style={{ fontSize: 12.5, color: "var(--rose, #ff6b81)" }}>{error}</p>
        )}
      </div>

      {draft && (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          {draft.failedAgents.length > 0 && (
            <div className="ai-summary-card" style={{ borderColor: "var(--amber)" }}>
              <div className="ai-head">
                <span className="eyebrow" style={{ color: "var(--amber)" }}>
                  Incomplete run
                </span>
              </div>
              <p style={{ fontSize: 12.5 }}>
                {draft.failedAgents.map((a) => AGENT_LABEL[a]).join(", ")} did
                not return a usable result after retrying. The plan below
                reflects only the agents that succeeded.
              </p>
            </div>
          )}

          <div className="ai-summary-card">
            <div className="ai-head" style={{ justifyContent: "space-between" }}>
              <span className="eyebrow">Raw source</span>
              <CopyButton text={draft.rawSource} />
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{draft.rawSource}</p>
          </div>

          <div className="ai-summary-card">
            <div className="ai-head" style={{ justifyContent: "space-between" }}>
              <span className="eyebrow">Structured plan</span>
              <CopyButton
                text={filledFields
                  .map(({ key, label }) => `${label}: ${draft.structured[key]}`)
                  .join("\n\n")}
              />
            </div>
            {filledFields.length === 0 && legacyCodes.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5 }}>
                No fields could be determined from the notes given.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {legacyCodes.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h4>Legacy codes</h4>
                      {draft.provenance.legacy_codes && (
                        <span className="tag">{AGENT_LABEL[draft.provenance.legacy_codes]}</span>
                      )}
                    </div>
                    <p>{legacyCodes.join(", ")}</p>
                  </div>
                )}
                {filledFields.map(({ key, label }) => (
                  <div key={key}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h4>{label}</h4>
                      {draft.provenance[key] && (
                        <span className="tag">{AGENT_LABEL[draft.provenance[key] as string]}</span>
                      )}
                    </div>
                    <p style={{ whiteSpace: "pre-wrap" }}>{draft.structured[key]}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ai-summary-card">
            <div className="ai-head" style={{ justifyContent: "space-between" }}>
              <span className="eyebrow">Needs your input · {draft.unresolved.length}</span>
              <CopyButton
                text={draft.unresolved
                  .map((u) => `${u.field}: ${u.issue}${u.candidates.length ? ` (candidates: ${u.candidates.join(", ")})` : ""}`)
                  .join("\n")}
              />
            </div>
            {draft.unresolved.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Nothing flagged as ambiguous or missing.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {draft.unresolved.map((u, i) => (
                  <li key={i}>
                    <strong>{u.field}</strong> — {u.issue}
                    {u.candidates.length > 0 && (
                      <span className="muted"> (candidates: {u.candidates.join(", ")})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ai-summary-card">
            <div className="ai-head" style={{ justifyContent: "space-between" }}>
              <span className="eyebrow">Recommended — not applied</span>
              <CopyButton
                text={draft.normalization
                  .map((r) => `${r.field}: ${r.suggestion} (${r.rationale})`)
                  .join("\n")}
              />
            </div>
            {draft.normalization.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5 }}>
                No suggestions.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {draft.normalization.map((r, i) => (
                  <li key={i}>
                    <strong>{r.field}</strong>: {r.suggestion}
                    <br />
                    <span className="muted" style={{ fontSize: 12 }}>{r.rationale}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!confirming ? (
            <button type="button" className="btn" onClick={openConfirm} style={{ alignSelf: "flex-start" }}>
              Create draft experiment
            </button>
          ) : (
            <div className="ai-summary-card">
              <div className="ai-head">
                <span className="eyebrow">Create draft experiment</span>
              </div>
              <p className="muted" style={{ fontSize: 12.5 }}>
                This creates a real experiment at draft status, with the raw
                notes and {draft.unresolved.length} unresolved item
                {draft.unresolved.length === 1 ? "" : "s"} attached. It
                cannot be started until every item is resolved.
              </p>

              <div className="field">
                <label htmlFor="commit-name">Experiment name</label>
                <input
                  id="commit-name"
                  value={commitName}
                  onChange={(e) => setCommitName(e.target.value)}
                  disabled={committing}
                />
              </div>

              <div className="field" style={{ maxWidth: 320 }}>
                <label htmlFor="commit-template">Template (optional)</label>
                <select
                  id="commit-template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  disabled={committing}
                >
                  <option value="">No template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={alsoCreateProject}
                    onChange={(e) => setAlsoCreateProject(e.target.checked)}
                    disabled={committing}
                  />
                  Also create a new project
                </label>
                {alsoCreateProject && (
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Project name"
                    disabled={committing}
                    style={{ marginTop: 8 }}
                  />
                )}
                <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                  Left unchecked, the experiment is created with no project
                  and an unresolved item noting that.
                </p>
              </div>

              {commitError && (
                <p style={{ fontSize: 12.5, color: "var(--rose, #ff6b81)" }}>{commitError}</p>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={!commitName.trim() || committing}
                  onClick={commit}
                >
                  {committing ? "Creating…" : "Confirm and create"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={committing}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
