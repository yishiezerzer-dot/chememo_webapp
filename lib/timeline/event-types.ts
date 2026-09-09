// §10.1's sixteen recommended event types, plus 'observed'.
//
// Its own module, and deliberately free of `server-only`: the classifier and
// the composer both need this vocabulary in the browser, and the service that
// writes it cannot be imported there. Kept in step by hand with the CHECK
// constraint in 20260909120000_timeline_events.sql — the same arrangement
// AI_SUGGESTIBLE_FIELDS has with its own CHECK, and for the same reason: a
// database guarantee behind anything a model can write.
export const TIMELINE_EVENT_TYPES = [
  "planned", "prepared", "started", "checked", "reconstituted", "transferred",
  "frozen", "thawed", "measured", "analyzed", "failed", "deviated", "shipped",
  "received", "disposed", "decision", "observed",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

// Ordered by how often someone reaches for them at a bench rather than as the
// standard happens to enumerate them: the default sits first and the rare ones
// sink. Used by the composer's picker.
export const EVENT_TYPE_LABELS: { value: TimelineEventType; label: string }[] = [
  { value: "observed", label: "Observed" },
  { value: "prepared", label: "Prepared" },
  { value: "started", label: "Started" },
  { value: "checked", label: "Checked" },
  { value: "measured", label: "Measured" },
  { value: "transferred", label: "Transferred" },
  { value: "analyzed", label: "Analyzed" },
  { value: "deviated", label: "Deviated" },
  { value: "decision", label: "Decision" },
  { value: "frozen", label: "Frozen" },
  { value: "thawed", label: "Thawed" },
  { value: "reconstituted", label: "Reconstituted" },
  { value: "planned", label: "Planned" },
  { value: "failed", label: "Failed" },
  { value: "shipped", label: "Shipped" },
  { value: "received", label: "Received" },
  { value: "disposed", label: "Disposed" },
];
