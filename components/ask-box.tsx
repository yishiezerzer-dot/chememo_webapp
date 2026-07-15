"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Query box + example chips with a loading state. Navigation to /ask?q=… runs
// inside a transition so we can show a "Thinking…" indicator while the server
// (embedding + retrieval + LLM) works.
export function AskBox({
  initialQuery,
  examples,
}: {
  initialQuery: string;
  examples: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [pending, start] = useTransition();

  const go = (query: string) => {
    if (!query.trim()) return;
    start(() => router.push(`/ask?q=${encodeURIComponent(query)}`));
  };

  return (
    <>
      <style>{`@keyframes cm-spin{to{transform:rotate(360deg)}}@keyframes cm-pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
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
            disabled={pending}
          />
        </div>
      </form>

      <div className="filter-chips example-chips" style={{ marginBottom: 24 }}>
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            className="chip"
            disabled={pending}
            onClick={() => {
              setQ(ex);
              go(ex);
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {pending && (
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
    </>
  );
}
