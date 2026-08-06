import { describe, expect, it } from "vitest";
import { requiredControlsPresent } from "@/lib/conditions/rules";
import type { Control } from "@/lib/types";

function control(control_type: Control["control_type"]): Control {
  return {
    id: control_type,
    experiment_id: "EXP-1",
    workspace_id: "ws-1",
    control_type,
    description: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("requiredControlsPresent", () => {
  it("without a condition program, only a blank is required", () => {
    expect(requiredControlsPresent([], false).satisfied).toBe(false);
    expect(requiredControlsPresent([control("blank")], false).satisfied).toBe(true);
  });

  it("with a condition program, a blank and one of no_catalyst/no_heat are both required", () => {
    const check = requiredControlsPresent([control("blank")], true);
    expect(check.satisfied).toBe(false);
    expect(check.missing).toContain("no_catalyst");

    expect(requiredControlsPresent([control("blank"), control("no_catalyst")], true).satisfied).toBe(true);
    // no_heat also satisfies the no_catalyst/no_heat slot.
    expect(requiredControlsPresent([control("blank"), control("no_heat")], true).satisfied).toBe(true);
  });

  it("lists exactly which required types are missing", () => {
    const check = requiredControlsPresent([], true);
    expect(check.missing).toEqual(["blank", "no_catalyst"]);
  });
});
