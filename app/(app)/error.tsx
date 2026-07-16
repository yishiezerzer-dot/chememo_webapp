"use client";

// Segment error boundary — the router renders this instead of a blank page
// when a Server Component or action under (app) throws.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="panel glass"
      style={{ maxWidth: 460, margin: "48px auto", textAlign: "center" }}
      role="alert"
    >
      <h3 style={{ fontFamily: "var(--display)", margin: "0 0 8px" }}>
        Something went wrong
      </h3>
      <p className="muted" style={{ margin: "0 0 16px", fontSize: 14 }}>
        {error.message || "An unexpected error occurred. You can try again."}
      </p>
      <button type="button" className="btn btn-primary btn-sm" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
