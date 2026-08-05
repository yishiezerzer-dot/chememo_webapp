// T1.4 D5 — a small finite per-unit conversion table, not a general UCUM
// engine: only the units the standard itself uses across its examples
// (§9.4, §13.2). Each unit belongs to exactly one family, converted via a
// base unit (Cel / h / mM / mg per mL / percent) so this stays O(units),
// not a pairwise O(units^2) formula table.
// T2.2 D5 adds "mass" and "volume", and "molar_concentration" gains "M" —
// §7.2's stock preparations and §7.6's experiment_inputs need real
// mass/volume units that didn't exist before (the pre-existing 'volume'
// quantity_kind had no matching family here at all).
type UnitFamily = "temperature" | "duration" | "molar_concentration" | "mass_concentration" | "percent" | "mass" | "volume";

const UNIT_FAMILY: Record<string, UnitFamily> = {
  Cel: "temperature",
  degF: "temperature",
  K: "temperature",
  h: "duration",
  min: "duration",
  d: "duration",
  mM: "molar_concentration",
  uM: "molar_concentration",
  M: "molar_concentration",
  "mg/mL": "mass_concentration",
  "ug/mL": "mass_concentration",
  "%": "percent",
  g: "mass",
  mg: "mass",
  kg: "mass",
  ug: "mass",
  mL: "volume",
  uL: "volume",
  L: "volume",
};

function toBase(value: number, unit: string, family: UnitFamily): number {
  switch (family) {
    case "temperature":
      if (unit === "Cel") return value;
      if (unit === "degF") return (value - 32) * (5 / 9);
      if (unit === "K") return value - 273.15;
      break;
    case "duration":
      if (unit === "h") return value;
      if (unit === "min") return value / 60;
      if (unit === "d") return value * 24;
      break;
    case "molar_concentration":
      if (unit === "mM") return value;
      if (unit === "uM") return value / 1000;
      if (unit === "M") return value * 1000;
      break;
    case "mass_concentration":
      if (unit === "mg/mL") return value;
      if (unit === "ug/mL") return value / 1000;
      break;
    case "percent":
      if (unit === "%") return value;
      break;
    case "mass":
      if (unit === "g") return value;
      if (unit === "mg") return value / 1000;
      if (unit === "kg") return value * 1000;
      if (unit === "ug") return value / 1_000_000;
      break;
    case "volume":
      if (unit === "mL") return value;
      if (unit === "uL") return value / 1000;
      if (unit === "L") return value * 1000;
      break;
  }
  throw new Error(`Unsupported unit "${unit}" for conversion.`);
}

function fromBase(value: number, unit: string, family: UnitFamily): number {
  switch (family) {
    case "temperature":
      if (unit === "Cel") return value;
      if (unit === "degF") return value * (9 / 5) + 32;
      if (unit === "K") return value + 273.15;
      break;
    case "duration":
      if (unit === "h") return value;
      if (unit === "min") return value * 60;
      if (unit === "d") return value / 24;
      break;
    case "molar_concentration":
      if (unit === "mM") return value;
      if (unit === "uM") return value * 1000;
      if (unit === "M") return value / 1000;
      break;
    case "mass_concentration":
      if (unit === "mg/mL") return value;
      if (unit === "ug/mL") return value * 1000;
      break;
    case "percent":
      if (unit === "%") return value;
      break;
    case "mass":
      if (unit === "g") return value;
      if (unit === "mg") return value * 1000;
      if (unit === "kg") return value / 1000;
      if (unit === "ug") return value * 1_000_000;
      break;
    case "volume":
      if (unit === "mL") return value;
      if (unit === "uL") return value * 1000;
      if (unit === "L") return value / 1000;
      break;
  }
  throw new Error(`Unsupported unit "${unit}" for conversion.`);
}

// Throws on an unsupported pair rather than silently passing the value
// through unconverted (T1.4 D5) — a wrong-but-plausible number is worse
// than a visible error.
export function convert(value: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return value;
  const fromFamily = UNIT_FAMILY[fromUnit];
  const toFamily = UNIT_FAMILY[toUnit];
  if (!fromFamily || !toFamily || fromFamily !== toFamily) {
    throw new Error(`Cannot convert from "${fromUnit}" to "${toUnit}".`);
  }
  return fromBase(toBase(value, fromUnit, fromFamily), toUnit, toFamily);
}

// T1.4 D6 — the export round-trip the acceptance criterion asks for:
// {kind: temperature, value: 80, unit: Cel} -> { temperature_C: 80 }.
// Built once here so T1.11's Markdown export reuses it rather than
// reinventing the mapping (per C4's instruction).
export function toStandardFieldName(
  kind: { standard_field_name: string; canonical_unit_code: string },
  value: number,
  unitCode: string
): Record<string, number> {
  return { [kind.standard_field_name]: convert(value, unitCode, kind.canonical_unit_code) };
}
