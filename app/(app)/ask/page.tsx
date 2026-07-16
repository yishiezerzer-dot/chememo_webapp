import Link from "next/link";
import { Fragment } from "react";
import { askAI } from "@/lib/rag";
import { AskBox } from "@/components/ask-box";
import { GroupSummary } from "@/components/group-summary";
import { generateGroupSummary } from "./actions";

const EXAMPLES = [
  "Which samples produced droplets?",
  "Experiments with m/z 297",
  "Wet–dry cycling at pH above 8",
  "What is a coacervate?",
  "Why does wet–dry cycling drive condensation?",
];

// Render grounded-answer text, turning [EXP-###] citations into links.
function AnswerText({ text }: { text: string }) {
  const parts = text.split(/(\[EXP-\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[(EXP-\d+)\]$/);
        return m ? (
          <Link key={i} href={`/experiments/${m[1]}`} className="td-id">
            {p}
          </Link>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        );
      })}
    </>
  );
}

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const search = query ? await askAI(query) : null;

  return (
    <div>
      <span className="eyebrow">Ask · AI search</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 6px" }}>
        Ask your notebook
      </h2>
      <p className="muted" style={{ marginTop: 0, maxWidth: "62ch" }}>
        Ask about your experiments and get grounded, cited answers — or ask a
        general chemistry question and the assistant will answer from its own
        knowledge (clearly marked as not from your data).
      </p>

      <AskBox initialQuery={query} examples={EXAMPLES} />

      {search && search.mode === "ai" && (
        <div>
          {search.answer && (
            <div className="ai-summary-card" style={{ marginBottom: 18 }}>
              <div className="ai-head">
                <span className="eyebrow">
                  {search.grounded ? "Grounded answer" : "General answer"}
                </span>
              </div>
              {!search.grounded && (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                  General chemistry knowledge — not based on your lab&rsquo;s
                  experiments.
                </p>
              )}
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                {search.grounded ? (
                  <AnswerText text={search.answer} />
                ) : (
                  search.answer
                )}
              </p>
            </div>
          )}

          {search.grounded && search.results.length > 0 && (
            <>
              {search.results.length > 1 && (
                <GroupSummary
                  ids={search.results.map((e) => e.id)}
                  action={generateGroupSummary}
                />
              )}
              <div className="section-title">
                <h3 style={{ fontFamily: "var(--display)", fontSize: 18, margin: 0 }}>
                  Sources · {search.results.length} experiment
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
            </>
          )}
        </div>
      )}

      {search && search.mode === "keyless" && (
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
            </div>
          ) : (
            <div className="card-grid">
              {search.results.map((e) => (
                <Link key={e.id} href={`/experiments/${e.id}`} className="exp-card glass">
                  <div className="ec-top">
                    <span className="ec-id">[{e.id}]</span>
                  </div>
                  <h4>{e.name}</h4>
                  <div className="ec-foot">
                    {e.ph !== null && <span className="ph">pH {e.ph}</span>}
                    {e.date && <span>{e.date}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
