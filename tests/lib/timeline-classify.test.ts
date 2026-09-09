import { describe, expect, it } from "vitest";
import { classifyLogText, isTimelineEventType } from "@/lib/timeline/classify";

// This is where most of the value in testing the composer lives: the
// deterministic path runs with or without an API key, so it can be tested
// exhaustively and cheaply, and it is the mechanism rather than the fallback.

describe("classifyLogText — event type", () => {
  it("defaults to 'observed' rather than guessing a §10.1 type", () => {
    // Filing an unclassifiable sentence as 'checked' would be a false record.
    const c = classifyLogText("The gel looked cloudy this morning.");
    expect(c.eventType).toBe("observed");
    expect(c.matchedOn).toBeNull();
  });

  it("reads the common bench verbs", () => {
    expect(classifyLogText("Froze the aliquots at -80.").eventType).toBe("frozen");
    expect(classifyLogText("Weighed out the solid.").eventType).toBe("measured");
    expect(classifyLogText("Ran LC-MS on the supernatant.").eventType).toBe("analyzed");
    expect(classifyLogText("Transferred 200 uL into a fresh vial.").eventType).toBe("transferred");
    expect(classifyLogText("Made up the buffer fresh.").eventType).toBe("prepared");
    expect(classifyLogText("Discarded the failed batch.").eventType).toBe("disposed");
  });

  it("prefers the specific phrase over the general word it contains", () => {
    // "took it out of the freezer" is a thaw. Testing the bare word "freezer"
    // first would file it as the opposite of what happened.
    const c = classifyLogText("Took it out of the freezer at 9am.");
    expect(c.eventType).toBe("thawed");
  });

  it("says which word decided it", () => {
    // The composer shows this back, so the classification is reviewable rather
    // than merely asserted.
    const c = classifyLogText("Accidentally used the wrong tube.");
    expect(c.eventType).toBe("deviated");
    expect(c.matchedOn?.toLowerCase()).toContain("accidental");
  });
});

describe("classifyLogText — extraction", () => {
  it("pulls pH, which is the most-filtered field in this app", () => {
    expect(classifyLogText("Adjusted to pH 7.4 with NaOH.").ph).toBe(7.4);
    expect(classifyLogText("pH = 8").ph).toBe(8);
    expect(classifyLogText("pH was 3.5 at the start").ph).toBe(3.5);
    expect(classifyLogText("No pH mentioned here").ph).toBeNull();
  });

  it("pulls quantities using the app's own unit codes", () => {
    const c = classifyLogText("Heated to 90 °C for 2 h in 250 uL of buffer.");
    expect(c.quantities).toEqual(
      expect.arrayContaining([
        { kind: "temperature", value: 90, unitCode: "Cel" },
        { kind: "duration", value: 2, unitCode: "h" },
        { kind: "volume", value: 250, unitCode: "uL" },
      ])
    );
  });

  it("takes one value per kind rather than guessing which volume is meant", () => {
    const c = classifyLogText("Took 100 uL from the 500 uL stock.");
    expect(c.quantities.filter((q) => q.kind === "volume")).toHaveLength(1);
  });

  it("does not let a pH double as a mass", () => {
    // "pH 7.4" should not also register as 7.4 grams via a loose unit match.
    const c = classifyLogText("Brought it to pH 7.4");
    expect(c.ph).toBe(7.4);
    expect(c.quantities.find((q) => q.value === 7.4)).toBeUndefined();
  });

  it("pulls m/z peaks", () => {
    expect(classifyLogText("Saw m/z 297.1, 315.2 in the trace.").mz).toEqual([297.1, 315.2]);
    expect(classifyLogText("Nothing spectral here").mz).toEqual([]);
  });

  it("recognises vial labels and experiment ids as subjects", () => {
    const c = classifyLogText("Moved E014-B1-LacPro-R1 into the rack, related to EXP-042.");
    expect(c.subjects).toContain("E014-B1-LacPro-R1");
    expect(c.subjects).toContain("EXP-042");
  });

  it("handles a real sentence end to end", () => {
    const c = classifyLogText(
      "Took E014-B1-LacPro-R1 out of the freezer, spun it down, resuspended in 200 uL at pH 7.4."
    );
    expect(c.eventType).toBe("thawed");
    expect(c.ph).toBe(7.4);
    expect(c.subjects).toContain("E014-B1-LacPro-R1");
    expect(c.quantities).toContainEqual({ kind: "volume", value: 200, unitCode: "uL" });
  });
});

describe("isTimelineEventType", () => {
  it("guards anything arriving from outside", () => {
    expect(isTimelineEventType("observed")).toBe(true);
    expect(isTimelineEventType("transferred")).toBe(true);
    // A model asked for an event type could return anything at all.
    expect(isTimelineEventType("pondered")).toBe(false);
    expect(isTimelineEventType("")).toBe(false);
  });
});
