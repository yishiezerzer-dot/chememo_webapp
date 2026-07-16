// Loading UI for /ask — shown while a server navigation runs the RAG pipeline
// (e.g. opening a shared /ask?q=… link). Client-side asks already show the
// AskBox "Thinking…" card; this covers the server-navigation case.
export default function AskLoading() {
  return (
    <div
      className="panel glass"
      style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}
      aria-busy="true"
    >
      <style>{`@keyframes cm-ask-spin{to{transform:rotate(360deg)}}`}</style>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "2px solid var(--border-strong)",
          borderTopColor: "var(--teal)",
          animation: "cm-ask-spin .7s linear infinite",
          flexShrink: 0,
        }}
      />
      <span className="muted" style={{ fontSize: 14 }}>
        Searching the notebook…
      </span>
    </div>
  );
}
