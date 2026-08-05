import { describe, expect, it } from "vitest";
import { convert, toStandardFieldName } from "@/lib/quantities/convert";

describe("convert", () => {
  it("round-trips temperature (Cel -> degF -> Cel)", () => {
    const f = convert(80, "Cel", "degF");
    expect(f).toBeCloseTo(176, 5);
    expect(convert(f, "degF", "Cel")).toBeCloseTo(80, 5);
  });

  it("converts Kelvin correctly", () => {
    expect(convert(0, "Cel", "K")).toBeCloseTo(273.15, 2);
  });

  it("round-trips duration (h -> min -> h)", () => {
    expect(convert(2, "h", "min")).toBe(120);
    expect(convert(120, "min", "h")).toBe(2);
  });

  it("scales molar concentration (mM -> uM)", () => {
    expect(convert(1, "mM", "uM")).toBe(1000);
  });

  it("returns the same value unchanged when units match", () => {
    expect(convert(42, "Cel", "Cel")).toBe(42);
  });

  it("throws on an unsupported unit pair rather than passing the value through", () => {
    expect(() => convert(1, "Cel", "mM")).toThrow();
    expect(() => convert(1, "made-up-unit", "Cel")).toThrow();
  });

  // T2.2 D5 — mass/volume families, and molar_concentration gaining "M".
  it("scales molar concentration to/from M (1 M = 1000 mM)", () => {
    expect(convert(1, "M", "mM")).toBe(1000);
    expect(convert(1000, "mM", "M")).toBe(1);
  });

  it("round-trips mass (g -> mg -> kg -> ug -> g)", () => {
    expect(convert(1, "g", "mg")).toBe(1000);
    expect(convert(1, "kg", "g")).toBe(1000);
    expect(convert(1_000_000, "ug", "g")).toBeCloseTo(1, 5);
    expect(convert(1, "mg", "g")).toBeCloseTo(0.001, 6);
  });

  it("round-trips volume (mL -> uL -> L -> mL)", () => {
    expect(convert(1, "mL", "uL")).toBe(1000);
    expect(convert(1, "L", "mL")).toBe(1000);
    expect(convert(1000, "mL", "L")).toBe(1);
  });

  it("does not let mass and volume units convert into each other", () => {
    expect(() => convert(1, "g", "mL")).toThrow();
  });
});

describe("toStandardFieldName", () => {
  it("round-trips {kind: temperature, value: 80, unit: Cel} -> {temperature_C: 80}", () => {
    const kind = { standard_field_name: "temperature_C", canonical_unit_code: "Cel" };
    expect(toStandardFieldName(kind, 80, "Cel")).toEqual({ temperature_C: 80 });
  });

  it("converts to the canonical unit before mapping", () => {
    const kind = { standard_field_name: "temperature_C", canonical_unit_code: "Cel" };
    const result = toStandardFieldName(kind, 176, "degF");
    expect(result.temperature_C).toBeCloseTo(80, 5);
  });
});
