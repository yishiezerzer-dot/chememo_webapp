import { describe, expect, it } from "vitest";
import {
  deriveMoles,
  determineLimitingReagent,
  calculateYield,
  totalVolumeLiters,
  finalConcentrationMolarPerL,
} from "@/lib/stoichiometry/calculate";

describe("deriveMoles", () => {
  it("computes moles from a stock's molar concentration and volume", () => {
    const { moles, calculation } = deriveMoles({ kind: "stock_concentration", volumeL: 0.01, concentrationMolarPerL: 0.5 });
    expect(moles).toBeCloseTo(0.005, 6);
    expect(calculation.formula).toContain("stock_concentration_M");
  });

  it("computes moles from a solid's mass, molecular weight, and purity", () => {
    // 1 g of a 100 g/mol material at 100% purity = exactly 0.01 mol.
    const { moles } = deriveMoles({ kind: "solid_mass", massG: 1, molecularWeight: 100, purityFraction: 1 });
    expect(moles).toBeCloseTo(0.01, 6);
  });

  it("accounts for purity < 100% (impure material yields fewer real moles per gram)", () => {
    const pure = deriveMoles({ kind: "solid_mass", massG: 1, molecularWeight: 100, purityFraction: 1 }).moles;
    const impure = deriveMoles({ kind: "solid_mass", massG: 1, molecularWeight: 100, purityFraction: 0.5 }).moles;
    expect(impure).toBeGreaterThan(pure);
  });

  it("computes moles from a liquid's volume, density, molecular weight, and purity", () => {
    // 1 mL at 1 g/mL = 1 g; at 100 g/mol, 100% purity -> 0.01 mol.
    const { moles } = deriveMoles({ kind: "liquid_volume", volumeMl: 1, densityGPerMl: 1, molecularWeight: 100, purityFraction: 1 });
    expect(moles).toBeCloseTo(0.01, 6);
  });
});

describe("determineLimitingReagent", () => {
  it("flags the lowest-moles reactant/substrate row as limiting, and computes equivalents relative to it", () => {
    const rows = [
      { id: "a", role: "reactant", moles: 0.01 },
      { id: "b", role: "reactant", moles: 0.005 },
      { id: "c", role: "catalyst", moles: 0.0001 },
    ];
    const { limitingId, equivalents } = determineLimitingReagent(rows);
    expect(limitingId).toBe("b");
    expect(equivalents.b).toBeCloseTo(1, 6);
    expect(equivalents.a).toBeCloseTo(2, 6);
    // Catalysts aren't stoichiometrically consumed, so they're excluded
    // even though their moles value is the smallest of all three.
    expect(equivalents.c).toBeUndefined();
  });

  it("returns no limiting reagent when no reactant/substrate row has a computed moles value", () => {
    const rows = [{ id: "a", role: "catalyst", moles: 0.001 }, { id: "b", role: "solvent", moles: null }];
    const { limitingId, equivalents } = determineLimitingReagent(rows);
    expect(limitingId).toBeNull();
    expect(equivalents).toEqual({});
  });
});

describe("calculateYield", () => {
  it("computes theoretical yield mass from limiting-reagent moles and product molecular weight", () => {
    const { theoreticalYieldMass } = calculateYield(0.005, 150, null);
    expect(theoreticalYieldMass).toBeCloseTo(0.75, 6);
  });

  it("computes percent yield when an actual mass is on record", () => {
    const { theoreticalYieldMass, percentYield } = calculateYield(0.005, 150, 0.6);
    expect(theoreticalYieldMass).toBeCloseTo(0.75, 6);
    expect(percentYield).toBeCloseTo(80, 6);
  });

  it("leaves percent yield null when no actual mass is recorded", () => {
    const { percentYield } = calculateYield(0.005, 150, null);
    expect(percentYield).toBeNull();
  });
});

describe("totalVolumeLiters / finalConcentrationMolarPerL", () => {
  it("sums input_amount_volume across inputs, converting to liters", () => {
    const total = totalVolumeLiters([
      { quantities: { input_amount_volume: { value: 500, unit_code: "mL" } } },
      { quantities: { input_amount_volume: { value: 200, unit_code: "mL" } } },
      { quantities: {} },
    ]);
    expect(total).toBeCloseTo(0.7, 6);
  });

  it("computes final concentration as moles / total volume", () => {
    expect(finalConcentrationMolarPerL(0.01, 0.1)).toBeCloseTo(0.1, 6);
  });

  it("returns null when moles is null or total volume is zero", () => {
    expect(finalConcentrationMolarPerL(null, 0.1)).toBeNull();
    expect(finalConcentrationMolarPerL(0.01, 0)).toBeNull();
  });
});
