"use client";

import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import { StatusBadge } from "@/components/status-badge";
import type { ActionResult, Experiment } from "@/lib/types";

// T2.9 D3/D4 — the single comparison-table implementation shared by the
// series detail page and the relationship-based "Compare" view, so
// side-by-side comparison is built once, not duplicated. Reaction mode is
// read from the experiment's first sample_matrix row (a matrix can have
// several rows with different modes — this is an at-a-glance summary, not
// an authoritative per-sample value).
export function ComparisonTable({
  experiments,
  controlsCounts,
  onRemove,
}: {
  experiments: Experiment[];
  controlsCounts: Record<string, number>;
  onRemove?: (experimentId: string) => Promise<ActionResult>;
}) {
  const { run, pending, pendingKey } = useRunAction();

  function remove(experimentId: string) {
    if (!onRemove) return;
    run(() => onRemove(experimentId), experimentId);
  }

  if (experiments.length === 0) {
    return <p className="muted">Nothing to compare yet.</p>;
  }

  return (
    <div className="table-scroll">
      <div className="table-scroll-inner" tabIndex={0} role="region" aria-label="Experiment comparison, scrollable">
        <table className="exp-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Status</th>
              <th>Date</th>
              <th>Reaction mode</th>
              <th>Temperature</th>
              <th>pH</th>
              <th>Cycles</th>
              <th>Compounds</th>
              <th>Controls</th>
              {onRemove && <th></th>}
            </tr>
          </thead>
          <tbody>
            {experiments.map((e) => {
              const temperature = e.quantities.temperature;
              const reactionMode = e.sample_matrix[0]?.reaction_mode || "—";
              return (
                <tr key={e.id}>
                  <td className="td-id">
                    <a href={`/experiments/${e.id}`}>{e.id}</a>
                  </td>
                  <td>{e.name}</td>
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="muted">{e.date ?? "—"}</td>
                  <td>{reactionMode}</td>
                  <td className="muted">{temperature ? `${temperature.value} ${temperature.unit_code}` : "—"}</td>
                  <td className="td-ph">{e.ph ?? "—"}</td>
                  <td className="td-center muted">{e.cycles ?? "—"}</td>
                  <td>{e.compounds.join(", ") || "—"}</td>
                  <td className="td-center muted">{controlsCounts[e.id] ?? 0}</td>
                  {onRemove && (
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} aria-busy={pending && pendingKey === e.id} onClick={() => remove(e.id)}>
                        {pending && pendingKey === e.id && <Spinner />}
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
