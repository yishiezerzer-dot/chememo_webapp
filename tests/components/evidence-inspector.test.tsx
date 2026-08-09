// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceInspector } from "@/components/evidence-inspector";
import type { Experiment } from "@/lib/types";
import type { MatchExplanation } from "@/lib/rag";

function experiment(id: string, name: string): Experiment {
  return { id, name } as unknown as Experiment;
}

// T3.4 D3 — the inspector must show every RETRIEVED record, not just the
// ones a grounded answer happened to cite (that's already covered by the
// citation chips elsewhere) — proving the full evidence set is inspectable.
describe("EvidenceInspector", () => {
  it("renders nothing when there are no results", () => {
    const { container } = render(<EvidenceInspector results={[]} explanations={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows every retrieved record once expanded, including one never cited in the final answer", () => {
    const results = [experiment("EXP-1", "First"), experiment("EXP-2", "Second")];
    const explanations: Record<string, MatchExplanation> = {
      "EXP-1": { matchedVia: "filter", appliedFilters: ["compound: Histidine"], semanticScore: null, sourceType: null, sectionType: null, snippet: null },
      "EXP-2": { matchedVia: "semantic", appliedFilters: [], semanticScore: 0.71, sourceType: "step_observation", sectionType: "observations", snippet: "Droplets observed." },
    };
    render(<EvidenceInspector results={results} explanations={explanations} />);

    expect(screen.queryByText(/First/)).toBeNull();
    fireEvent.click(screen.getByText(/Show evidence inspector/));
    expect(screen.getByText(/First/)).not.toBeNull();
    expect(screen.getByText(/Second/)).not.toBeNull();
    expect(screen.getByText(/compound: Histidine/)).not.toBeNull();
    expect(screen.getByText(/Droplets observed\./)).not.toBeNull();
  });
});
