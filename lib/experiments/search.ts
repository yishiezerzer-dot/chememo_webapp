import "server-only";
import { createClient } from "@/lib/supabase/server";
import { encodeCursor, decodeCursor } from "@/lib/experiments/search-params";
import { activeWorkspaceId } from "@/lib/authorization/policies";
import type { Experiment, ExperimentSearchParams, ExperimentSortKey } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Query = ReturnType<Supabase["from"]>;

const PAGE_SIZE = 25;

const SORT_COLUMN: Record<ExperimentSortKey, string> = {
  date: "date",
  name: "name",
  ph: "ph",
  cycles: "cycles",
  id: "id",
};

// T1.6 D5 — the one filter-building function shared by the page query, the
// facet counts, and the CSV export, so all three always agree on "what
// matches the current search."
// workspaceId is applied here rather than at the three call sites because
// this is the one place every experiment query in this module passes
// through — search, facet counts and the unlimited CSV export. Missing it on
// any one of them would leak another workspace's records into a count or an
// export while the visible list still looked correctly scoped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, params: ExperimentSearchParams, workspaceId?: string | null) {
  let q = query.is("deleted_at", null);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (params.q?.trim()) {
    // websearch_to_tsquery handles quoted phrases and "-exclude" the way
    // users actually type, unlike plainto_tsquery (D1).
    q = q.textSearch("search_vector", params.q.trim(), { type: "websearch", config: "english" });
  }
  if (params.project) q = q.eq("project", params.project);
  if (params.status) q = q.eq("status", params.status);
  if (params.reactionType) q = q.ilike("reaction_type", `%${params.reactionType}%`);
  if (params.methods?.length) q = q.overlaps("methods", params.methods);
  if (params.dateFrom) q = q.gte("date", params.dateFrom);
  if (params.dateTo) q = q.lte("date", params.dateTo);
  if (params.phMin !== undefined) q = q.gte("ph", params.phMin);
  if (params.phMax !== undefined) q = q.lte("ph", params.phMax);
  return q;
}

export type ExperimentSearchResult = {
  rows: Experiment[];
  nextCursor: string | null;
  facets: {
    status: Record<string, number>;
    project: Record<string, number>;
    reactionType: Record<string, number>;
    methods: Record<string, number>;
  };
};

// T1.6 D2 — generalized keyset pagination: works for any sortable column by
// encoding (sort value, id) as the cursor and comparing that composite pair,
// not just id. nulls sort last regardless of direction (nullsFirst: false),
// so once a non-null cursor value is exhausted, every remaining null-sort-
// value row is still "ahead" and included unconditionally.
export async function searchExperiments(
  params: ExperimentSearchParams,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<ExperimentSearchResult> {
  const supabase = await createClient();
  const limit = opts.limit ?? PAGE_SIZE;
  const sortKey = params.sort ?? "date";
  const dir = params.dir ?? "desc";
  const sortCol = SORT_COLUMN[sortKey];
  const ascending = dir === "asc";

  const workspaceId = await activeWorkspaceId();
  let q = applyFilters((supabase.from("experiments") as Query).select("*"), params, workspaceId);

  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
  if (cursor) {
    const cmp = ascending ? "gt" : "lt";
    if (cursor.value === null) {
      q = q.is(sortCol, null);
      q = ascending ? q.gt("id", cursor.id) : q.lt("id", cursor.id);
    } else {
      const valStr = typeof cursor.value === "number" ? String(cursor.value) : `"${cursor.value}"`;
      q = q.or(
        `${sortCol}.${cmp}.${valStr},and(${sortCol}.eq.${valStr},id.${cmp}.${cursor.id}),${sortCol}.is.null`
      );
    }
  }

  q = q.order(sortCol, { ascending, nullsFirst: false }).order("id", { ascending }).limit(limit + 1);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as Experiment[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1] as (Experiment & Record<string, unknown>) | undefined;
  const nextCursor =
    hasMore && last
      ? encodeCursor({ value: (last[sortCol] as string | number | null) ?? null, id: last.id })
      : null;

  const facets = await computeFacets(supabase, params, workspaceId);

  return { rows: pageRows, nextCursor, facets };
}

// A plain .select() caps out at Supabase/PostgREST's ~1000-row response
// limit with no error and no truncation flag -- fine at today's dataset size,
// but computeFacets/searchAllExperiments below both pull every matching row,
// so once the match set exceeds that cap they'd silently go wrong (undercounted
// facets; a CSV export missing rows with no indication anything was cut).
// Paging with .range() sees every row regardless of table size.
const RANGE_PAGE_SIZE = 1000;
async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: (from: number, to: number) => any
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += RANGE_PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + RANGE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < RANGE_PAGE_SIZE) break;
  }
  return rows;
}

// T1.6 D3 — scoped to columns that exist today (status/project/reaction_type/
// methods); true per-sample facets need T2.3's samples table. Counts reflect
// the *same* filter set as the page query, per the spec's own wording — not
// the "exclude this dimension" faceted-search convention.
async function computeFacets(
  supabase: Supabase,
  params: ExperimentSearchParams,
  workspaceId: string | null
): Promise<ExperimentSearchResult["facets"]> {
  const rows = await fetchAllRows<{
    status: string | null;
    project: string | null;
    reaction_type: string | null;
    methods: string[] | null;
  }>((from, to) =>
    applyFilters(
      (supabase.from("experiments") as Query).select("status, project, reaction_type, methods"),
      params,
      workspaceId
    ).range(from, to)
  );

  const status: Record<string, number> = {};
  const project: Record<string, number> = {};
  const reactionType: Record<string, number> = {};
  const methods: Record<string, number> = {};
  for (const row of rows) {
    if (row.status) status[row.status] = (status[row.status] ?? 0) + 1;
    if (row.project) project[row.project] = (project[row.project] ?? 0) + 1;
    if (row.reaction_type) reactionType[row.reaction_type] = (reactionType[row.reaction_type] ?? 0) + 1;
    for (const m of row.methods ?? []) methods[m] = (methods[m] ?? 0) + 1;
  }
  return { status, project, reactionType, methods };
}

// T1.6 D6 — the full matching set with no limit/cursor, for CSV export
// (a scientist exporting "all wet-dry cycling experiments" expects every
// match, not just the current page). Same filter logic as searchExperiments.
export async function searchAllExperiments(params: ExperimentSearchParams): Promise<Experiment[]> {
  const supabase = await createClient();
  const workspaceId = await activeWorkspaceId();
  return fetchAllRows<Experiment>((from, to) =>
    applyFilters((supabase.from("experiments") as Query).select("*"), params, workspaceId)
      .order("date", { ascending: false })
      .range(from, to)
  );
}
