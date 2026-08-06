import type { Control, ControlType } from "@/lib/types";

// T2.6 D5 — a deliberately simple v1 baseline rule, not the audit's full
// four-context-dependent checklist engine (disclosed scope trim, spec D5).
// reaction_mode is a per-sample field (T2.3 G11), not per-experiment, so
// this uses `hasConditionProgram` (any batch has an applied wet-dry cycle
// program) as the grounded signal instead: those experiments expect at
// least one blank and one of no_catalyst/no_heat; every other experiment
// just expects a blank. Computed at read time, never stored, so it always
// reflects live controls. Pure/no server dependency (mirrors T2.4's
// lib/stoichiometry/calculate.ts) so both the server service and this
// client-rendered panel can import it directly.
export type RequiredControlsCheck = {
  required: ControlType[];
  missing: ControlType[];
  satisfied: boolean;
};

export function requiredControlsPresent(controls: Control[], hasConditionProgram: boolean): RequiredControlsCheck {
  const present = new Set(controls.map((c) => c.control_type));
  const required: ControlType[] = hasConditionProgram ? ["blank", "no_catalyst"] : ["blank"];
  const missing = required.filter((type) => {
    if (type === "no_catalyst") return !present.has("no_catalyst") && !present.has("no_heat");
    return !present.has(type);
  });
  return { required, missing, satisfied: missing.length === 0 };
}
