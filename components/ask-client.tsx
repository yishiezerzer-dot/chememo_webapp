"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import type { Experiment } from "@/lib/types";
import { GroupSummary } from "@/components/group-summary";
import { generateGroupSummary } from "@/app/(app)/ask/actions";

type AskMeta = {
  mode: "keyless" | "ai";
  grounded: boolean;
  streaming: boolean;
  interpretation: string[];
  results: Experiment[];
  emptyReason: string | null;
};

type Phase = "idle" | "loading" | "streaming" | "done";

function renderCitations(text: string) {
  return text.split(/(\[EXP-\d+\])/g).map((p, i) => {
    const m = p.match(/^\[(EXP-\d+)\]$/);
    return m ? (
      <Link key={i} href={`/experiments/${m[1]}`} className="td-id">
        {p}
      </Link>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    );
  });
}

export function AskClient({
  initialQuery,
  examples,
}: {
  initialQuery: string;
  examples: string[];
}) {
  const [q, setQ] = useState(initialQuery);
  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<AskMeta | null>(null);
  const [answer, setAnswer] = useState("");
  const [failed, setFailed] = useState(false);
  const busy = phase === "loading" || phase === "streaming";

  async function run(raw: string) {
    const query = raw.trim();
    if (!query || busy) return;
    setQ(query);
    setPhase("loading");
    setMeta(null);
    setAnswer("");
    setFailed(false);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let gotMeta = false;
      let ans = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        if (!gotMeta) {
          const nl = buf.indexOf("\n");
          if (nl < 0) continue;
          const m = JSON.parse(buf.slice(0, nl)) as AskMeta;
          buf = buf.slice(nl + 1);
          gotMeta = true;
          setMeta(m);
          setPhase(m.streaming ? "streaming" : "done");
        }
        if (gotMeta && buf) {
          ans += buf;
          buf = "";
          setAnswer(ans);
        }
      }
      setPhase("done");
    } catch {
      setFailed(true);
      setPhase("done");
    }
  }

  // Auto-run a query passed in via ?q= (shared links).
  const ran = useRef(false);
  useEffect(() => {
    if (!ran.current && initialQuery.trim()) {
      ran.current = true;
      run(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showAnswerCard = meta?.mode === "ai" && (answer || phase === "streaming");

  return (
    <>
      <style>{`@keyframes cm-spin{to{transform:rotate(360deg)}}@keyframes cm-pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
        className="ask-box"
        style={{ margin: "18px 0 14px" }}
      >
        <div className="searchbox" style={{ maxWidth: 640 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask anything — e.g. which samples formed droplets?"
            aria-label="Ask a question"
            autoFocus
            disabled={busy}
          />
        </div>
      </form>

      <div className="filter-chips example-chips" style={{ marginBottom: 24 }}>
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => run(ex)}
          >
            {ex}
          </button>
        ))}
      </div>

      {phase === "loading" && (
        <div
          className="ai-summary-card"
          style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="var(--teal)"
            strokeWidth="2"
            style={{ animation: "cm-spin .8s linear infinite" }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span style={{ fontFamily: "var(--display)", fontSize: 16 }}>
            Thinking
            <span style={{ animation: "cm-pulse 1.2s ease-in-out infinite" }}>…</span>
          </span>
        </div>
      )}

      {meta?.mode === "ai" && (
        <div>
          {showAnswerCard && (
            <div className="ai-summary-card" style={{ marginBottom: 18 }}>
              <div className="ai-head">
                <span className="eyebrow">{meta.grounded ? "Grounded answer" : "General answer"}</span>
              </div>
              {!meta.grounded && (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                  General chemistry knowledge — not based on your lab&rsquo;s experiments.
                </p>
              )}
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                {meta.grounded ? renderCitations(answer) : answer}
                {phase === "streaming" && (
                  <span style={{ animation: "cm-pulse 1.1s ease-in-out infinite" }}>▍</span>
                )}
              </p>
            </div>
          )}

          {phase === "done" && !answer && !failed && (
            <div className="empty-state">
              <div className="big">No matching experiments found.</div>
            </div>
          )}
          {failed && (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Something went wrong answering that. Please try again.
            </p>
          )}

          {meta.grounded && meta.results.length > 0 && (
            <>
              {meta.results.length > 1 && (
                <GroupSummary ids={meta.results.map((e) => e.id)} action={generateGroupSummary} />
              )}
              <div className="section-title">
                <h3 style={{ fontFamily: "var(--display)", fontSize: 18, margin: 0 }}>
                  Sources · {meta.results.length} experiment{meta.results.length === 1 ? "" : "s"}
                </h3>
              </div>
              <div className="card-grid">
                {meta.results.map((e) => (
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

      {meta?.mode === "keyless" && (
        <div>
          {meta.interpretation.length > 0 && (
            <div className="glass" style={{ padding: "14px 18px", marginBottom: 18 }}>
              <span className="eyebrow">Interpreted as</span>
              <div className="detail-meta" style={{ marginTop: 8 }}>
                {meta.interpretation.map((i) => (
                  <span key={i} className="chip active">
                    {i}
                  </span>
                ))}
              </div>
            </div>
          )}
          {meta.emptyReason ? (
            <div className="empty-state">
              <div className="big">{meta.emptyReason}</div>
            </div>
          ) : (
            <div className="card-grid">
              {meta.results.map((e) => (
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
    </>
  );
}
