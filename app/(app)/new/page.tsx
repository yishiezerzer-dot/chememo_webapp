export default function NewExperimentPage() {
  return (
    <div>
      <span className="eyebrow">New experiment</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 30, margin: "8px 0 18px" }}>
        New experiment
      </h2>
      <div className="glass" style={{ padding: "26px 28px", maxWidth: 640 }}>
        <p style={{ margin: 0, color: "var(--ink-dim)" }}>
          The structured entry form is built in Phase 3.
        </p>
      </div>
    </div>
  );
}
