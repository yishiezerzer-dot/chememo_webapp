import { describe, expect, it } from "vitest";
import {
  parseExperimentSearchParams,
  buildExperimentQueryString,
  encodeCursor,
  decodeCursor,
} from "@/lib/experiments/search-params";

describe("parseExperimentSearchParams / buildExperimentQueryString", () => {
  it("round-trips a full filter set through the URL and back", () => {
    const params = {
      q: "histidine wet-dry",
      project: "wet-dry-cycling",
      status: "completed" as const,
      reactionType: "Wet-dry cycling",
      methods: ["NMR", "LC-MS/MS (pos)"],
      dateFrom: "2026-01-01",
      dateTo: "2026-06-30",
      phMin: 6,
      phMax: 8.5,
      sort: "ph" as const,
      dir: "asc" as const,
    };
    const qs = buildExperimentQueryString(params);
    const raw = Object.fromEntries(new URLSearchParams(qs));
    expect(parseExperimentSearchParams(raw)).toEqual(params);
  });

  it("omits keys entirely when unset, rather than empty-string params", () => {
    const qs = buildExperimentQueryString({});
    expect(qs).toBe("");
  });

  it("ignores an unrecognized sort key rather than passing it through", () => {
    const parsed = parseExperimentSearchParams({ sort: "not-a-real-column" });
    expect(parsed.sort).toBeUndefined();
  });

  it("includes the cursor only when one is passed", () => {
    expect(buildExperimentQueryString({}, "abc123")).toBe("cursor=abc123");
    expect(buildExperimentQueryString({})).toBe("");
  });
});

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a string sort value", () => {
    const cursor = { value: "E014", id: "EXP-014" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("round-trips a null sort value (nulls-last pagination tail)", () => {
    const cursor = { value: null, id: "EXP-003" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects a garbage/tampered cursor instead of throwing", () => {
    expect(decodeCursor("not-valid-base64url-json")).toBeNull();
    expect(decodeCursor(Buffer.from("[]").toString("base64url"))).toBeNull();
  });
});
