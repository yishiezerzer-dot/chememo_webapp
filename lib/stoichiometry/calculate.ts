import type { Quantity, StockCalculation } from "@/lib/types";
import { convert } from "@/lib/quantities/convert";

// T2.4 D2 — moles are derived by exactly one of three paths, depending on
// what data the input actually has. Missing data means no computed value
// (reported, never guessed) rather than a wrong number.
export type MolesSource =
  | { kind: "stock_concentration"; volumeL: number; concentrationMolarPerL: number }
  | { kind: "solid_mass"; massG: number; molecularWeight: number; purityFraction: number }
  | { kind: "liquid_volume"; volumeMl: number; densityGPerMl: number; molecularWeight: number; purityFraction: number };

export function deriveMoles(source: MolesSource): { moles: number; calculation: StockCalculation } {
  switch (source.kind) {
    case "stock_concentration": {
      const moles = source.volumeL * source.concentrationMolarPerL;
      return {
        moles,
        calculation: {
          formula: "moles = volume_L * stock_concentration_M",
          inputs: { volume_L: source.volumeL, stock_concentration_M: source.concentrationMolarPerL },
        },
      };
    }
    case "solid_mass": {
      const moles = source.massG / source.molecularWeight / source.purityFraction;
      return {
        moles,
        calculation: {
          formula: "moles = mass_g / molecular_weight / purity_fraction",
          inputs: {
            mass_g: source.massG,
            molecular_weight: source.molecularWeight,
            purity_fraction: source.purityFraction,
          },
        },
      };
    }
    case "liquid_volume": {
      const massG = source.volumeMl * source.densityGPerMl;
      const moles = massG / source.molecularWeight / source.purityFraction;
      return {
        moles,
        calculation: {
          formula: "moles = (volume_mL * density_g_per_mL) / molecular_weight / purity_fraction",
          inputs: {
            volume_mL: source.volumeMl,
            density_g_per_mL: source.densityGPerMl,
            molecular_weight: source.molecularWeight,
            purity_fraction: source.purityFraction,
          },
        },
      };
    }
  }
}

// T2.4 D3 — the lowest-moles reactant/substrate-role row is the limiting
// reagent; every other such row's equivalents are relative to it. Roles
// that aren't stoichiometrically consumed (catalyst/solvent/buffer/quench/
// standard/control) are excluded from limiting-reagent consideration.
const CONSUMED_ROLES = new Set(["reactant", "substrate"]);

export function determineLimitingReagent(
  rows: { id: string; role: string; moles: number | null }[]
): { limitingId: string | null; equivalents: Record<string, number> } {
  const candidates = rows.filter((r) => CONSUMED_ROLES.has(r.role) && r.moles !== null && r.moles > 0);
  if (candidates.length === 0) return { limitingId: null, equivalents: {} };

  const limiting = candidates.reduce((min, r) => (r.moles! < min.moles! ? r : min));
  const equivalents: Record<string, number> = {};
  for (const r of candidates) {
    equivalents[r.id] = r.moles! / limiting.moles!;
  }
  return { limitingId: limiting.id, equivalents };
}

// T2.4 D6 — theoretical mass from the limiting reagent's moles and the
// output material's own molecular weight; % yield when an actual mass is
// on record for the output.
export function calculateYield(
  limitingMoles: number,
  outputMolecularWeight: number,
  actualMassG: number | null
): { theoreticalYieldMass: number; percentYield: number | null; calculation: StockCalculation } {
  const theoreticalYieldMass = limitingMoles * outputMolecularWeight;
  const percentYield = actualMassG !== null && theoreticalYieldMass > 0 ? (actualMassG / theoreticalYieldMass) * 100 : null;
  return {
    theoreticalYieldMass,
    percentYield,
    calculation: {
      formula: "theoretical_yield_mass_g = limiting_reagent_moles * output_molecular_weight",
      inputs: { limiting_reagent_moles: limitingMoles, output_molecular_weight: outputMolecularWeight },
    },
  };
}

// D5 — total reaction volume and per-input final concentration, computed
// live from already-stored quantities; never persisted (would just be a
// cache that could drift).
export function totalVolumeLiters(inputs: { quantities: Record<string, Quantity> }[]): number {
  return inputs.reduce((sum, i) => {
    const vol = i.quantities.input_amount_volume;
    if (!vol) return sum;
    try {
      return sum + convert(vol.value, vol.unit_code, "L");
    } catch {
      return sum;
    }
  }, 0);
}

export function finalConcentrationMolarPerL(moles: number | null, totalVolumeL: number): number | null {
  if (moles === null || totalVolumeL <= 0) return null;
  return moles / totalVolumeL;
}
