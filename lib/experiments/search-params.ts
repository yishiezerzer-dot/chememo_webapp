import type { ExperimentSearchParams, ExperimentSortKey, ExperimentStatus } from "@/lib/types";

// T1.6 D5 — the one place that converts between the URL query string and
// ExperimentSearchParams, in both directions. Shared by the server page
// (parse) and the client table (build), so they can never drift out of sync
// with each other.
const SORT_KEYS: ExperimentSortKey[] = ["date", "name", "ph", "cycles", "id"];

// T1.6 D2 — the keyset-pagination cursor: (sort column value, id tiebreaker),
// opaque-encoded so the URL doesn't leak raw column values as a stable API.
export type Cursor = { value: string | number | null; id: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(s: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || typeof parsed.id !== "string") return null;
    return parsed as Cursor;
  } catch {
    return null;
  }
}

export function parseExperimentSearchParams(raw: Record<string, string | undefined>): ExperimentSearchParams {
  return {
    q: raw.q || undefined,
    project: raw.project || undefined,
    status: (raw.status as ExperimentStatus | undefined) || undefined,
    reactionType: raw.reaction_type || undefined,
    methods: raw.methods ? raw.methods.split(",").filter(Boolean) : undefined,
    dateFrom: raw.date_from || undefined,
    dateTo: raw.date_to || undefined,
    phMin: raw.ph_min ? Number(raw.ph_min) : undefined,
    phMax: raw.ph_max ? Number(raw.ph_max) : undefined,
    sort: SORT_KEYS.includes(raw.sort as ExperimentSortKey) ? (raw.sort as ExperimentSortKey) : undefined,
    dir: raw.dir === "asc" ? "asc" : raw.dir === "desc" ? "desc" : undefined,
  };
}

export function buildExperimentQueryString(params: ExperimentSearchParams, cursor?: string | null): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.project) qs.set("project", params.project);
  if (params.status) qs.set("status", params.status);
  if (params.reactionType) qs.set("reaction_type", params.reactionType);
  if (params.methods?.length) qs.set("methods", params.methods.join(","));
  if (params.dateFrom) qs.set("date_from", params.dateFrom);
  if (params.dateTo) qs.set("date_to", params.dateTo);
  if (params.phMin !== undefined) qs.set("ph_min", String(params.phMin));
  if (params.phMax !== undefined) qs.set("ph_max", String(params.phMax));
  if (params.sort) qs.set("sort", params.sort);
  if (params.dir) qs.set("dir", params.dir);
  if (cursor) qs.set("cursor", cursor);
  return qs.toString();
}
