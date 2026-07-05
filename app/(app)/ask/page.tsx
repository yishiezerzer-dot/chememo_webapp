import Link from "next/link";
import { keylessSearch } from "@/lib/search";

const EXAMPLES = [
  "Histidine + thioglycolic acid + zinc experiments",
  "Which samples produced droplets?",
  "Experiments with m/z 297",
  "Wet–dry cycling at pH above 8",
  "Depsipeptide experiments analysed by NMR",
];

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const search = query ? await keylessSearch(query) : null;

  return (
    <div>
      <span className="eyebrow">Ask · keyless search</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 6px" }}>
        Ask your notebook
      </h2>
      <p className="muted" style={{ marginTop: 0, maxWidth: "60ch" }}>
        Exact, deterministic search over every stored experiment — pH, compounds,
        metals, m/z, methods, or a word like &ldquo;droplets&rdquo;. Every result
        is a real record, cited by ID. (Grounded AI answers arrive in Phase 10.)
      </p>

      <form method="get" className="ask-box" style={{ margin: "18px 0 14px" }}>
        <div className="searchbox" style={{ maxWidth: 640 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            name="q"
            defaultValue={query}
            placeholder="e.g. wet–dry cycling at pH above 8"
            aria-label="Ask a question"
            autoFocus
          />
        </div>
      </form>

      <div className="filter-chips example-chips" style={{ marginBottom: 24 }}>
        {EXAMPLES.map((ex) => (
          <Link key={ex} href={`/ask?q=${encodeURIComponent(ex)}`} className="chip">
            {ex}
          </Link>
        ))}
      </div>

      {search && (
        <div>
          {search.interpretation.length > 0 && (
            <div className="glass" style={{ padding: "14px 18px", marginBottom: 18 }}>
              <span className="eyebrow">Interpreted as</span>
              <div className="detail-meta" style={{ marginTop: 8 }}>
                {search.interpretation.map((i) => (
                  <span key={i} className="chip active">
                    {i}
                  </span>
                ))}
              </div>
            </div>
          )}

          {search.emptyReason ? (
            <div className="empty-state">
              <div className="big">{search.emptyReason}</div>
              {search.results.length === 0 &&
                "Nothing matched — try a different compound, condition, or word."}
            </div>
          ) : (
            <>
              <div className="section-title">
                <h3 style={{ fontFamily: "var(--display)", fontSize: 18, margin: 0 }}>
                  {search.results.length} matching experiment
                  {search.results.length === 1 ? "" : "s"}
                </h3>
              </div>

              <div className="card-grid">
                {search.results.map((e) => (
                  <Link key={e.id} href={`/experiments/${e.id}`} className="exp-card glass">
                    <div className="ec-top">
                      <span className="ec-id">[{e.id}]</span>
                    </div>
                    <h4>{e.name}</h4>
                    <div className="ec-meta">
                      {e.metals.map((m) => (
                        <span key={m} className="tag">
                          {m}
                        </span>
                      ))}
                      {e.mz.slice(0, 3).map((m) => (
                        <span key={m} className="tag">
                          m/z {m}
                        </span>
                      ))}
                    </div>
                    <div className="ec-foot">
                      {e.ph !== null && <span className="ph">pH {e.ph}</span>}
                      {e.cycles !== null && <span>{e.cycles} cyc</span>}
                      {e.date && <span>{e.date}</span>}
                    </div>
                  </Link>
                ))}
              </div>

              <div className="glass" style={{ padding: "16px 18px", marginTop: 20 }}>
                <span className="eyebrow">Sources</span>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {search.results.map((e) => (
                    <Link
                      key={e.id}
                      href={`/experiments/${e.id}`}
                      style={{ fontSize: 13, textDecoration: "none" }}
                    >
                      <span className="td-id" style={{ marginRight: 8 }}>
                        [{e.id}]
                      </span>
                      <span className="muted">{e.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
