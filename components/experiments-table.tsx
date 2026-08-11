"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { StatusBadge, STATUS_LABEL } from "@/components/status-badge";
import { exportExperimentsCsvAction, saveViewAction, deleteViewAction } from "@/app/(app)/experiments/actions";
import {
  buildExperimentQueryString as buildQueryString,
  parseExperimentSearchParams,
} from "@/lib/experiments/search-params";
import type { Experiment, ExperimentSearchParams, ExperimentSortKey, ExperimentStatus, Project, SavedView } from "@/lib/types";

type Facets = {
  status: Record<string, number>;
  project: Record<string, number>;
  reactionType: Record<string, number>;
  methods: Record<string, number>;
};

const ALL_STATUSES: ExperimentStatus[] = [
  "draft", "planned", "in_progress", "paused", "completed", "reviewed", "archived", "failed", "cancelled",
];

export function ExperimentsTable({
  rows,
  nextCursor,
  facets,
  projects,
  savedViews,
  params,
}: {
  rows: Experiment[];
  nextCursor: string | null;
  facets: Facets;
  projects: Project[];
  savedViews: SavedView[];
  params: ExperimentSearchParams;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.q ?? "");
  const [viewName, setViewName] = useState("");

  function navigate(patch: Partial<ExperimentSearchParams>) {
    // Read the live URL, not the `params` prop -- that prop is a snapshot
    // from the last server render, so two filter edits fired back-to-back
    // (before the first router.push's RSC round-trip lands and refreshes
    // `params`) would each build off the same stale snapshot and clobber
    // each other. useSearchParams() reflects the URL immediately after
    // router.push updates it client-side, so this stays correct even when
    // called again before the previous navigation has fully resolved.
    const current = parseExperimentSearchParams(Object.fromEntries(searchParams.entries()));
    // Any filter change restarts pagination (a stale cursor from a different
    // filter set could skip or duplicate rows).
    router.push(`/experiments?${buildQueryString({ ...current, ...patch })}`);
  }

  function toggleSort(key: ExperimentSortKey) {
    if (params.sort === key || (!params.sort && key === "date")) {
      navigate({ sort: key, dir: params.dir === "asc" ? "desc" : "asc" });
    } else {
      navigate({ sort: key, dir: key === "name" || key === "id" ? "asc" : "desc" });
    }
  }

  const sortKey = params.sort ?? "date";
  const dir = params.dir ?? "desc";
  const arrow = (key: ExperimentSortKey) => (sortKey === key ? <span className="sort-i">{dir === "asc" ? "▲" : "▼"}</span> : null);
  const ariaSort = (key: ExperimentSortKey): "ascending" | "descending" | "none" =>
    sortKey === key ? (dir === "asc" ? "ascending" : "descending") : "none";

  const projectLabel = Object.fromEntries(projects.map((p) => [p.id, p.label]));

  async function exportCsv() {
    const csv = await exportExperimentsCsvAction(params);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chememo-experiments-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function saveView() {
    const name = viewName.trim();
    if (!name) return;
    start(async () => {
      const res = await saveViewAction(name, params);
      if (!res.ok) showToast(res.error, "error");
      else {
        setViewName("");
        router.refresh();
      }
    });
  }

  function deleteView(id: string) {
    start(async () => {
      const res = await deleteViewAction(id);
      if (!res.ok) showToast(res.error, "error");
      else router.refresh();
    });
  }

  return (
    <>
      <div className="toolbar">
        <form
          className="searchbox"
          style={{ maxWidth: 340 }}
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ q: q.trim() || undefined });
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search experiments…"
            aria-label="Search experiments"
          />
        </form>
        <div className="filter-chips">
          <button
            className={`chip${!params.project ? " active" : ""}`}
            onClick={() => navigate({ project: undefined })}
          >
            All projects
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              className={`chip${params.project === p.id ? " active" : ""}`}
              onClick={() => navigate({ project: p.id })}
            >
              <span className="pdot" style={{ color: p.color ?? "var(--teal)" }}></span>
              {p.label}
              {facets.project[p.id] ? ` (${facets.project[p.id]})` : ""}
            </button>
          ))}
        </div>
        <select
          aria-label="Status filter"
          value={params.status ?? ""}
          onChange={(e) => navigate({ status: (e.target.value || undefined) as ExperimentStatus | undefined })}
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
              {facets.status[s] ? ` (${facets.status[s]})` : ""}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="number"
            aria-label="pH min"
            placeholder="pH min"
            defaultValue={params.phMin ?? ""}
            style={{ width: 80 }}
            onBlur={(e) => navigate({ phMin: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
          <input
            type="number"
            aria-label="pH max"
            placeholder="pH max"
            defaultValue={params.phMax ?? ""}
            style={{ width: 80 }}
            onBlur={(e) => navigate({ phMax: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="date"
            aria-label="Date from"
            defaultValue={params.dateFrom ?? ""}
            onBlur={(e) => navigate({ dateFrom: e.target.value || undefined })}
          />
          <input
            type="date"
            aria-label="Date to"
            defaultValue={params.dateTo ?? ""}
            onBlur={(e) => navigate({ dateTo: e.target.value || undefined })}
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={exportCsv}
          title="Download every matching row (not just this page) as CSV"
        >
          Export CSV
        </button>
      </div>

      <div className="toolbar" style={{ marginTop: 8 }}>
        <div className="filter-chips">
          {savedViews.map((v) => (
            <span key={v.id} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <a href={`/experiments?${buildQueryString(v.query)}`} style={{ color: "inherit" }}>
                {v.name}
              </a>
              <b onClick={() => deleteView(v.id)} style={{ cursor: "pointer" }}>
                ×
              </b>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <input
            aria-label="Save this view as"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder="Save this view as…"
            style={{ maxWidth: 180 }}
          />
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={saveView}>
            Save view
          </button>
        </div>
      </div>

      <div className="table-scroll">
        <div className="table-scroll-inner" tabIndex={0} role="region" aria-label="Experiments table, scrollable">
          <table className="exp-table">
            <thead>
              <tr>
                <th className="col-id" aria-sort={ariaSort("id")}>
                  <button type="button" className="th-sort-btn" onClick={() => toggleSort("id")}>
                    ID {arrow("id")}
                  </button>
                </th>
                <th className="col-name" aria-sort={ariaSort("name")}>
                  <button type="button" className="th-sort-btn" onClick={() => toggleSort("name")}>
                    Name {arrow("name")}
                  </button>
                </th>
                <th className="col-date" aria-sort={ariaSort("date")}>
                  <button type="button" className="th-sort-btn" onClick={() => toggleSort("date")}>
                    Date {arrow("date")}
                  </button>
                </th>
                <th className="col-status">Status</th>
                <th className="col-proj">Project</th>
                <th className="col-ph" aria-sort={ariaSort("ph")}>
                  <button type="button" className="th-sort-btn" onClick={() => toggleSort("ph")}>
                    pH {arrow("ph")}
                  </button>
                </th>
                <th className="col-cyc" aria-sort={ariaSort("cycles")}>
                  <button type="button" className="th-sort-btn" onClick={() => toggleSort("cycles")}>
                    Cyc {arrow("cycles")}
                  </button>
                </th>
                <th className="col-comp">Compounds</th>
                <th className="col-meth">Methods</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} onClick={() => router.push(`/experiments/${e.id}`)}>
                  <td className="td-id">{e.id}</td>
                  <td className="td-name">
                    <span className="tn-main">{e.name}</span>
                    {e.researcher && <small>{e.researcher}</small>}
                  </td>
                  <td className="muted">{e.date ?? "—"}</td>
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                  <td>{e.project ? projectLabel[e.project] ?? e.project : "—"}</td>
                  <td className="td-ph">{e.ph ?? "—"}</td>
                  <td className="td-center muted">{e.cycles ?? "—"}</td>
                  <td>
                    <div className="cell-tags">
                      {e.compounds.slice(0, 3).map((c) => (
                        <span key={c} className="tag">
                          {c}
                        </span>
                      ))}
                      {e.compounds.length > 3 && <span className="muted">+{e.compounds.length - 3}</span>}
                    </div>
                  </td>
                  <td className="muted">{e.methods.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="empty-state">
              <div className="big">No experiments match</div>
              Try clearing the search or filters.
            </div>
          )}
        </div>
      </div>

      {nextCursor && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => router.push(`/experiments?${buildQueryString(params, nextCursor)}`)}
          >
            Load more
          </button>
        </div>
      )}
    </>
  );
}
