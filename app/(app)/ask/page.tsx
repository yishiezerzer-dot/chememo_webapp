export default function AskPage() {
  return (
    <div>
      <span className="eyebrow">Ask AI</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 30, margin: "8px 0 18px" }}>
        Ask your notebook
      </h2>
      <div className="glass" style={{ padding: "26px 28px", maxWidth: 640 }}>
        <p style={{ margin: 0, color: "var(--ink-dim)" }}>
          Keyless exact search lands in Phase 5; grounded AI answers activate in
          Phase 10.
        </p>
      </div>
    </div>
  );
}
