import { AskClient } from "@/components/ask-client";

const EXAMPLES = [
  "Which samples produced droplets?",
  "Experiments with m/z 297",
  "Wet–dry cycling at pH above 8",
  "What is a coacervate?",
  "Why does wet–dry cycling drive condensation?",
];

// Shell only — the query is sent by POST (not in the URL) and the answer streams
// back client-side (see components/ask-client.tsx + app/api/ask/route.ts). A ?q=
// param still works for shared links: AskClient auto-runs it on mount.
export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mode?: string }>;
}) {
  const { q, mode } = await searchParams;
  const initialAskMode = mode === "context" ? "context" : "lab";

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

      <AskClient initialQuery={q?.trim() ?? ""} initialAskMode={initialAskMode} examples={EXAMPLES} />
    </div>
  );
}
