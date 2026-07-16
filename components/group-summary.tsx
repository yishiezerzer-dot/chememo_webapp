"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";

// Turn [EXP-###] citations in the summary into links.
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

export function GroupSummary({
  ids,
  action,
}: {
  ids: string[];
  action: (ids: string[]) => Promise<string | null>;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  if (summary) {
    return (
      <div className="ai-summary-card" style={{ marginBottom: 18 }}>
        <div className="ai-head">
          <span className="eyebrow">Group summary · {ids.length} experiments</span>
        </div>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{renderCitations(summary)}</p>
      </div>
    );
  }

  return (
    <div style={{ margin: "4px 0 18px" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setFailed(false);
            const s = await action(ids);
            if (s) setSummary(s);
            else setFailed(true);
          })
        }
      >
        {pending ? "Summarising…" : `Summarise these ${ids.length} experiments`}
      </button>
      {failed && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          Couldn&rsquo;t generate a summary right now.
        </p>
      )}
    </div>
  );
}
