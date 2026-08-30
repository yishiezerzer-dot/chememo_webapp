import Link from "next/link";

// T1.9 D3 — a plain unread-count badge linking to /notifications; no
// real-time push, just reflects the count at the last page load/navigation.
export function NotificationBell({ count }: { count: number }) {
  return (
    <Link href="/notifications" prefetch={false} className="btn btn-ghost btn-sm" style={{ position: "relative" }} aria-label="Notifications">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            // #b91c1c, not the lighter Radix red — the lighter shade fails
            // WCAG AA contrast against white text at this badge's small size.
            background: "#b91c1c",
            color: "white",
            borderRadius: "999px",
            fontSize: 10,
            lineHeight: 1,
            padding: "2px 5px",
            fontFamily: "var(--mono)",
          }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
