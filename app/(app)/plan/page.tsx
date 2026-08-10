import { listProjects } from "@/lib/projects/service";
import { isLlmEnabled } from "@/lib/llm";
import { PlanClient } from "@/components/plan-client";

// T3.7 D10 — no keyless fallback for planning (unlike Ask): the crew IS the
// feature, so when no chat provider key is configured, show a clear message
// instead of a form that can't do anything.
export default async function PlanPage() {
  if (!isLlmEnabled()) {
    return (
      <div>
        <span className="eyebrow">Plan · AI planning crew</span>
        <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 6px" }}>
          Plan an experiment
        </h2>
        <div className="empty-state">
          <div className="big">AI planning is not configured.</div>
        </div>
      </div>
    );
  }

  const projects = await listProjects();

  return (
    <div>
      <span className="eyebrow">Plan · AI planning crew</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 6px" }}>
        Plan an experiment
      </h2>
      <p className="muted" style={{ marginTop: 0, maxWidth: "62ch" }}>
        Turn rough bench notes into a structured draft plan: scientific
        question, hypothesis, controls, and open questions to resolve
        yourself. Nothing here is saved or applied automatically.
      </p>

      <PlanClient projects={projects} />
    </div>
  );
}
