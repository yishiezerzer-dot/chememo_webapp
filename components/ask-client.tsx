"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Experiment } from "@/lib/types";
import type { CitedAnswer } from "@/lib/llm";
import type { MatchExplanation } from "@/lib/rag";
import { GroupSummary } from "@/components/group-summary";
import { CitedAnswerView } from "@/components/cited-answer";
import { EvidenceInspector } from "@/components/evidence-inspector";
import { AiFeedback } from "@/components/ai-feedback";
import { generateGroupSummary, submitAiFeedback } from "@/app/(app)/ask/actions";

type AskMode = "lab" | "context";

// The general-knowledge ("Scientific context") path streams raw model prose,
// which sometimes includes markdown bold (**like this**) even though nothing
// downstream ever parsed it -- it was rendering as literal asterisks. Handles
// bold only (the one thing actually observed), not a full markdown parser;
// an unclosed "**" mid-stream just renders literally until its pair arrives.
function renderInlineBold(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

type AskMeta = {
  mode: "keyless" | "ai";
  askMode: AskMode;
  grounded: boolean;
  // T3.2 D2 — true only when the body is live-streamed prose (context/
  // general-knowledge path); false when it's one complete JSON CitedAnswer
  // blob (grounded lab-mode) or there's no body at all (keyless/empty cases).
  streaming: boolean;
  interpretation: string[];
  results: Experiment[];
  emptyReason: string | null;
  // T3.3 D2 — per-experiment "why it matched", keyed by experiment id.
  explanations: Record<string, MatchExplanation>;
  // T3.4 D4 — the ai_requests row id for this answer, when one exists.
  requestId: string | null;
};

function explainMatch(e: MatchExplanation): string {
  const parts: string[] = [];
  if (e.appliedFilters.length) parts.push(e.appliedFilters.join(", "));
  if (e.semanticScore !== null) {
    const via = e.sourceType ? `${e.sourceType}/${e.sectionType}` : "semantic";
    parts.push(`${via} match, score ${e.semanticScore.toFixed(2)}`);
  }
  return parts.join(" + ");
}

type Phase = "idle" | "loading" | "streaming" | "done";

export function AskClient({
  initialQuery,
  initialAskMode,
  examples,
}: {
  initialQuery: string;
  initialAskMode: AskMode;
  examples: string[];
}) {
  const [q, setQ] = useState(initialQuery);
  const [askMode, setAskMode] = useState<AskMode>(initialAskMode);
  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<AskMeta | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [citedAnswer, setCitedAnswer] = useState<CitedAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = phase === "loading" || phase === "streaming";

  function selectAskMode(next: AskMode) {
    setAskMode(next);
    const url = new URL(window.location.href);
    if (next === "lab") url.searchParams.delete("mode");
    else url.searchParams.set("mode", next);
    window.history.replaceState(null, "", url);
  }

  async function run(raw: string) {
    const query = raw.trim();
    if (!query || busy) return;
    setQ(query);
    setPhase("loading");
    setMeta(null);
    setAnswerText("");
    setCitedAnswer(null);
    setFailed(false);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, mode: askMode }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let gotMeta = false;
      let metaVal: AskMeta | null = null;
      let bodyText = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        if (!gotMeta) {
          const nl = buf.indexOf("\n");
          if (nl < 0) continue;
          metaVal = JSON.parse(buf.slice(0, nl)) as AskMeta;
          buf = buf.slice(nl + 1);
          gotMeta = true;
          setMeta(metaVal);
          // Streamed prose shows as it arrives; a structured grounded answer
          // (one JSON blob) keeps the "Thinking…" spinner until it's parseable.
          setPhase(metaVal.streaming ? "streaming" : metaVal.grounded ? "loading" : "done");
        }
        if (gotMeta && buf) {
          bodyText += buf;
          buf = "";
          if (metaVal?.streaming) setAnswerText(bodyText);
        }
      }

      if (metaVal && !metaVal.streaming && metaVal.grounded && bodyText) {
        try {
          setCitedAnswer(JSON.parse(bodyText) as CitedAnswer);
        } catch {
          setFailed(true);
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

  const showAnswerCard =
    meta?.mode === "ai" && (citedAnswer !== null || answerText.length > 0 || phase === "streaming");
  // True whenever the shown answer is general chemistry knowledge, not the
  // lab's own data — covers both "Scientific context" mode AND a lab-mode
  // question whose records didn't actually answer it (T3.2's fallback).
  const isGeneralKnowledge = meta?.mode === "ai" && !meta.grounded;

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

      <div className="filter-chips" style={{ marginBottom: 14 }} role="radiogroup" aria-label="Ask mode">
        <button
          type="button"
          role="radio"
          aria-checked={askMode === "lab"}
          className={`chip${askMode === "lab" ? " active" : ""}`}
          disabled={busy}
          onClick={() => selectAskMode("lab")}
        >
          Search my lab
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={askMode === "context"}
          className={`chip${askMode === "context" ? " active" : ""}`}
          disabled={busy}
          onClick={() => selectAskMode("context")}
        >
          Scientific context
        </button>
      </div>

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
          role="status"
          aria-live="polite"
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

      {failed && (
        <p className="muted" style={{ fontSize: 12.5 }}>
          Something went wrong answering that. Please try again.
        </p>
      )}

      {meta?.mode === "ai" && (
        <div>
          {showAnswerCard && (
            <div
              className="ai-summary-card"
              aria-live="polite"
              aria-atomic="true"
              style={
                isGeneralKnowledge
                  ? {
                      marginBottom: 18,
                      borderColor: "var(--amber)",
                      background: "rgba(255,212,121,.08)",
                    }
                  : { marginBottom: 18 }
              }
            >
              <div className="ai-head">
                <span
                  className="eyebrow"
                  style={isGeneralKnowledge ? { color: "var(--amber)" } : undefined}
                >
                  {isGeneralKnowledge ? "Scientific context" : "Grounded answer"}
                </span>
              </div>
              {isGeneralKnowledge && (
                <p style={{ fontSize: 12.5, marginTop: 8, color: "var(--amber)", fontWeight: 600 }}>
                  General chemistry knowledge — not from your lab&rsquo;s experiments.
                </p>
              )}
              {citedAnswer ? (
                <CitedAnswerView answer={citedAnswer} />
              ) : (
                <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                  {renderInlineBold(answerText)}
                  {phase === "streaming" && (
                    <span style={{ animation: "cm-pulse 1.1s ease-in-out infinite" }}>▍</span>
                  )}
                </p>
              )}
              {citedAnswer && meta.grounded && (
                <EvidenceInspector results={meta.results} explanations={meta.explanations} />
              )}
              {meta.requestId && <AiFeedback requestId={meta.requestId} action={submitAiFeedback} />}
            </div>
          )}

          {phase === "done" && !citedAnswer && !answerText && !failed && (
            <div className="empty-state">
              <div className="big">{meta.emptyReason ?? "No matching experiments found."}</div>
            </div>
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
                    {meta.explanations[e.id] && explainMatch(meta.explanations[e.id]) && (
                      <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                        Why it matched: {explainMatch(meta.explanations[e.id])}
                      </p>
                    )}
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
