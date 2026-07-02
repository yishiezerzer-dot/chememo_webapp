export default function ExperimentsPage() {
  return (
    <div>
      <span className="eyebrow">Experiments</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 30, margin: "8px 0 18px" }}>
        Experiments
      </h2>
      <div className="glass" style={{ padding: "26px 28px", maxWidth: 640 }}>
        <p style={{ margin: 0, color: "var(--ink-dim)" }}>
          The experiments table (search, sort, filters) is built in Phase 3.
        </p>
      </div>
    </div>
  );
}
