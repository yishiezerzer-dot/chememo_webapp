import Link from "next/link";
import type { CitedAnswer } from "@/lib/llm";

// T3.2 D4 — shared renderer for both the Ask screen and the group-summary
// card. Every citation chip resolves to a real retrieved evidence object
// (experimentId/snippet), never parsed out of the model's own words — see
// lib/llm.ts's generateCitedAnswer for how segments/citations are validated
// server-side before ever reaching this component.
export function CitedAnswerView({ answer }: { answer: CitedAnswer }) {
  return (
    <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
      {answer.segments.map((seg, i) => (
        <span key={i}>
          {seg.text}
          {seg.citations.map((c) => (
            <Link
              key={c.label}
              href={`/experiments/${c.experimentId}`}
              className="td-id"
              title={c.snippet}
              style={{ marginLeft: 4 }}
            >
              [{c.experimentId}]
            </Link>
          ))}
          {i < answer.segments.length - 1 ? " " : null}
        </span>
      ))}
    </p>
  );
}
