// Segment loading UI — shown while a route's server data resolves. Simple
// pulsing glass placeholders so navigations never flash an empty view.
export default function Loading() {
  const bar = (w: string): React.CSSProperties => ({
    height: 14,
    width: w,
    borderRadius: 7,
    background: "var(--border-strong)",
    opacity: 0.5,
    animation: "cm-load-pulse 1.2s ease-in-out infinite",
  });

  return (
    <div aria-busy="true" aria-label="Loading">
      <style>{`@keyframes cm-load-pulse{0%,100%{opacity:.35}50%{opacity:.7}}`}</style>
      <div className="panel glass" style={{ marginBottom: 16 }}>
        <div style={{ ...bar("40%"), marginBottom: 14 }} />
        <div style={{ ...bar("90%"), marginBottom: 10 }} />
        <div style={{ ...bar("75%") }} />
      </div>
      <div className="panel glass">
        <div style={{ ...bar("55%"), marginBottom: 14 }} />
        <div style={{ ...bar("85%"), marginBottom: 10 }} />
        <div style={{ ...bar("65%") }} />
      </div>
    </div>
  );
}
