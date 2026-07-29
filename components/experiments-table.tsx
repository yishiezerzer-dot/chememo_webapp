"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import type { Experiment, Project } from "@/lib/types";

type SortKey = "id" | "name" | "date" | "project" | "ph" | "cycles";
type PhFilter = "all" | "lt7" | "eq7" | "gt8";

// Quote a CSV cell only when it contains a comma, quote, or newline.
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Experiment[], projectLabel: Record<string, string>): string {
  const headers = [
    "ID", "Name", "Date", "Researcher", "Project", "Reaction type",
    "pH", "Cycles", "Compounds", "Metals", "Methods", "m/z",
    "Observations", "Notes",
  ];
  const lines = rows.map((e) =>
    [
      e.id, e.name, e.date, e.researcher,
      e.project ? projectLabel[e.project] ?? e.project : "",
      e.reaction_type, e.ph, e.cycles,
      e.compounds.join("; "), e.metals.join("; "), e.methods.join("; "),
      e.mz.join("; "), e.observations, e.notes,
    ]
      .map(csvCell)
      .join(",")
  );
  return [headers.join(","), ...lines].join("\r\n");
}

export function ExperimentsTable({
  experiments,
  projects,
  initialQuery = "",
  initialProject = "all",
}: {
  experiments: Experiment[];
  projects: Project[];
  initialQuery?: string;
  initialProject?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [project, setProject] = useState<string>(initialProject);
  const [ph, setPh] = useState<PhFilter>("all");
  // D12 — archived leaves the default "active work" view and nothing else.
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SortKey>("date");
  const [asc, setAsc] = useState(false);

  // Re-sync from the URL when navigation changes the params (e.g. clicking a
  // sidebar project link, or a global search, while already on this page).
  // Adjusted during render (React's recommended pattern for resetting state
  // from a tracked value) rather than in an effect.
  const [prevInitialProject, setPrevInitialProject] = useState(initialProject);
  if (initialProject !== prevInitialProject) {
    setPrevInitialProject(initialProject);
    setProject(initialProject);
  }
  const [prevInitialQuery, setPrevInitialQuery] = useState(initialQuery);
  if (initialQuery !== prevInitialQuery) {
    setPrevInitialQuery(initialQuery);
    setQ(initialQuery);
  }

  const projectLabel = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.label])),
    [projects]
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = experiments.filter((e) => {
      if (!showArchived && e.status === "archived") return false;
      if (project !== "all" && e.project !== project) return false;
      if (ph === "lt7" && !(e.ph !== null && e.ph < 7)) return false;
      if (ph === "eq7" && e.ph !== 7) return false;
      if (ph === "gt8" && !(e.ph !== null && e.ph > 8)) return false;
      if (!needle) return true;
      const hay = [
        e.id,
        e.name,
        e.researcher,
        e.reaction_type,
        ...e.compounds,
        ...e.metals,
        ...e.methods,
        e.observations,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });

    out = [...out].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sort) {
        case "ph":
          av = a.ph ?? -Infinity;
          bv = b.ph ?? -Infinity;
          break;
        case "cycles":
          av = a.cycles ?? -Infinity;
          bv = b.cycles ?? -Infinity;
          break;
        case "date":
          av = a.date ?? "";
          bv = b.date ?? "";
          break;
        default:
          av = (a[sort] ?? "") as string;
          bv = (b[sort] ?? "") as string;
      }
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
    return out;
  }, [experiments, q, project, ph, showArchived, sort, asc]);

  function toggleSort(key: SortKey) {
    if (sort === key) setAsc((a) => !a);
    else {
      setSort(key);
      setAsc(key === "name" || key === "id");
    }
  }

  const arrow = (key: SortKey) =>
    sort === key ? <span className="sort-i">{asc ? "▲" : "▼"}</span> : null;

  const phChips: { key: PhFilter; label: string }[] = [
    { key: "all", label: "All pH" },
    { key: "lt7", label: "pH < 7" },
    { key: "eq7", label: "pH = 7" },
    { key: "gt8", label: "pH > 8" },
  ];

  function exportCsv() {
    const csv = toCsv(rows, projectLabel);
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

  return (
    <>
      <div className="toolbar">
        <div className="searchbox" style={{ maxWidth: 340 }}>
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
        </div>
        <div className="filter-chips">
          <button
            className={`chip${project === "all" ? " active" : ""}`}
            onClick={() => setProject("all")}
          >
            All projects
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              className={`chip${project === p.id ? " active" : ""}`}
              onClick={() => setProject(p.id)}
            >
              <span className="pdot" style={{ color: p.color ?? "var(--teal)" }}></span>
              {p.label}
            </button>
          ))}
        </div>
        <div className="filter-chips">
          {phChips.map((c) => (
            <button
              key={c.key}
              className={`chip${ph === c.key ? " active" : ""}`}
              onClick={() => setPh(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="filter-chips">
          <button
            type="button"
            className={`chip${showArchived ? " active" : ""}`}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        </div>
        <span className="count-pill" style={{ marginLeft: "auto" }}>
          {rows.length} / {experiments.length}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={exportCsv}
          disabled={rows.length === 0}
          title="Download the filtered rows as CSV"
          style={{ marginLeft: 8 }}
        >
          Export CSV
        </button>
      </div>

      <div className="table-scroll">
        <div className="table-scroll-inner">
          <table className="exp-table">
            <thead>
              <tr>
                <th className="col-id" onClick={() => toggleSort("id")}>
                  ID {arrow("id")}
                </th>
                <th className="col-name" onClick={() => toggleSort("name")}>
                  Name {arrow("name")}
                </th>
                <th className="col-date" onClick={() => toggleSort("date")}>
                  Date {arrow("date")}
                </th>
                <th className="col-status">Status</th>
                <th className="col-proj" onClick={() => toggleSort("project")}>
                  Project {arrow("project")}
                </th>
                <th className="col-ph" onClick={() => toggleSort("ph")}>
                  pH {arrow("ph")}
                </th>
                <th className="col-cyc" onClick={() => toggleSort("cycles")}>
                  Cyc {arrow("cycles")}
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
                      {e.compounds.length > 3 && (
                        <span className="muted">+{e.compounds.length - 3}</span>
                      )}
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
    </>
  );
}
