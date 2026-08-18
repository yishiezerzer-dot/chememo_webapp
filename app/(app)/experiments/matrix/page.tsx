import Link from "next/link";
import { getMatrixPivot, type MatrixDimension } from "@/lib/matrix/service";

const DIMENSION_LABELS: Record<MatrixDimension, string> = {
  component_1: "Component 1",
  component_2: "Component 2",
  reaction_mode: "Reaction mode",
  sample_type: "Sample type",
};
const DIMENSIONS = Object.keys(DIMENSION_LABELS) as MatrixDimension[];

function isDimension(value: string | undefined): value is MatrixDimension {
  return !!value && (DIMENSIONS as string[]).includes(value);
}

// T2.9 D5/D6 — a matrix view for systematic screens, pivoting over
// sample_matrix's component_1/component_2 (free text, matches the
// Standard's §21.2 worked example) or the two already-enumerated
// controlled-vocabulary fields. No table/grid library exists in this
// codebase (experiments-table.tsx/series-detail-client.tsx are both plain
// HTML tables) — this follows the same convention.
export default async function MatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ x?: string; y?: string }>;
}) {
  const params = await searchParams;
  const dimensionX: MatrixDimension = isDimension(params.x) ? params.x : "component_1";
  const dimensionY: MatrixDimension = isDimension(params.y) ? params.y : "component_2";
  const pivot = await getMatrixPivot(dimensionX, dimensionY);

  return (
    <div>
      <span className="eyebrow">Matrix</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 12px" }}>
        Systematic screen matrix
      </h2>

      <form style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 13 }}>
          Rows
          <select name="y" defaultValue={dimensionY} style={{ marginLeft: 6 }}>
            {DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {DIMENSION_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Columns
          <select name="x" defaultValue={dimensionX} style={{ marginLeft: 6 }}>
            {DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {DIMENSION_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-sm">
          Update
        </button>
      </form>

      {(dimensionX === "component_1" || dimensionX === "component_2" || dimensionY === "component_1" || dimensionY === "component_2") && (
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Component 1/2 are free text — near-duplicate spellings (e.g. &ldquo;L-Lac&rdquo; vs &ldquo;l-lac&rdquo;) appear as separate cells.
        </p>
      )}

      {pivot.xValues.length === 0 || pivot.yValues.length === 0 ? (
        <div className="empty-state">
          {/* Phrased as a gap in existing data, the old copy read as a fault
              in a brand-new notebook that simply has no records at all. Say
              what the view is for and what fills it, rather than naming two
              fields the reader has never seen. */}
          <div className="big">Nothing to plot yet</div>
          <p style={{ margin: "6px 0 0" }}>
            This view pivots your sample matrix into a screen grid — one axis against another, so a
            systematic series can be read at a glance. It fills in once experiments have sample
            matrix rows with both {DIMENSION_LABELS[dimensionX]} and {DIMENSION_LABELS[dimensionY]}{" "}
            set.
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <div className="table-scroll-inner" tabIndex={0} role="region" aria-label="Screen matrix, scrollable">
            <table className="exp-table">
              <thead>
                <tr>
                  <th>{DIMENSION_LABELS[dimensionY]} \ {DIMENSION_LABELS[dimensionX]}</th>
                  {pivot.xValues.map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pivot.yValues.map((y) => (
                  <tr key={y}>
                    <td className="muted">{y}</td>
                    {pivot.xValues.map((x) => {
                      const cell = pivot.cells[y]?.[x];
                      return (
                        <td key={x} className="td-center">
                          {cell ? (
                            <Link href={`/experiments/compare?ids=${cell.experimentIds.join(",")}`}>{cell.count}</Link>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
