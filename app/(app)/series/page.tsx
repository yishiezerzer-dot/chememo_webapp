import Link from "next/link";
import { listSeries } from "@/lib/series/service";

export default async function SeriesPage() {
  const series = await listSeries();

  return (
    <div>
      <div className="detail-head">
        <div>
          <span className="eyebrow">Series</span>
          <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 0" }}>
            Experiment series
          </h2>
        </div>
        <Link href="/series/new" className="btn btn-primary btn-sm">
          + New series
        </Link>
      </div>

      {series.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          No series yet.
        </p>
      ) : (
        <div className="entry-menu-grid" style={{ marginTop: 16 }}>
          {series.map((s) => (
            <Link key={s.id} href={`/series/${s.id}`} className="obs-box glass entry-menu-card">
              <h4 style={{ margin: "0 0 8px" }}>{s.name}</h4>
              {s.description && (
                <p className="sec-sub" style={{ margin: 0 }}>
                  {s.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
