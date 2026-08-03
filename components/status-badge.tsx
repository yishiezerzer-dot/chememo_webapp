import type { ExperimentStatus } from "@/lib/types";

export const STATUS_LABEL: Record<ExperimentStatus, string> = {
  draft: "Draft",
  planned: "Planned",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
  reviewed: "Reviewed",
  archived: "Archived",
  failed: "Failed",
  cancelled: "Cancelled",
};

const CLASS: Record<ExperimentStatus, string> = {
  draft: "s-draft",
  planned: "s-planned",
  in_progress: "s-in-progress",
  paused: "s-paused",
  completed: "s-completed",
  reviewed: "s-reviewed",
  archived: "s-archived",
  failed: "s-failed",
  cancelled: "s-cancelled",
};

function Icon({ status }: { status: ExperimentStatus | null }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, width: 13, height: 13 } as const;
  switch (status) {
    case "draft":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "planned":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "in_progress":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8l6 4-6 4Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "paused":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 9v6M14 9v6" />
        </svg>
      );
    case "completed":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l2.5 2.5L16 9.5" />
        </svg>
      );
    case "reviewed":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z" />
          <path d="M8.5 12l2.3 2.3L15.5 9.5" />
        </svg>
      );
    case "archived":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="5" rx="1.5" />
          <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
        </svg>
      );
    case "failed":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
      );
    case "cancelled":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M7 7l10 10" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16.5v.01" />
        </svg>
      );
  }
}

// Colour + icon + text together for all 9 states plus the null legacy case
// (never colour alone — audit §10.4). §19.4: a legacy row with no recorded
// status names the gap instead of guessing one.
export function StatusBadge({ status }: { status: ExperimentStatus | null }) {
  if (status === null) {
    return (
      <span className="status-badge s-unknown" title="This record predates the lifecycle field (standard §19.4).">
        <Icon status={null} />
        Status not recorded
      </span>
    );
  }
  return (
    <span className={`status-badge ${CLASS[status]}`}>
      <Icon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}
