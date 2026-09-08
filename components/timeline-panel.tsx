"use client";

import { useRef, useState } from "react";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import { useStickyState } from "@/lib/use-sticky-state";
import type { ActionResult } from "@/lib/types";
import type { TimelineEvent, TimelineEventType, TimelineEventView } from "@/lib/timeline/service";

// §10.1's sixteen, plus 'observed'. Ordered by how often a person reaches for
// them at a bench, not alphabetically or as the standard happens to list them:
// the default sits first and the rare ones sink.
const EVENT_TYPES: { value: TimelineEventType; label: string }[] = [
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

const LABEL = new Map(EVENT_TYPES.map((t) => [t.value, t.label]));

const fmtTime = (iso: string) => iso.slice(11, 16);
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

// What an entry actually says. The projections fill different columns than the
// composer does, so this reads them in the order a person would: what was
// done, then what was seen, then what went wrong, then what happens next.
function entryText(e: TimelineEvent): string {
  return [e.action, e.observation, e.deviation_note, e.next_action].filter(Boolean).join(" — ");
}

function Entry({ event, isCorrection }: { event: TimelineEvent; isCorrection?: boolean }) {
  return (
    <div style={{ paddingLeft: isCorrection ? 16 : 0, marginTop: isCorrection ? 4 : 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-mute)" }}>
          {fmtTime(event.occurred_at)}
        </span>
        <span className="chip" style={{ fontSize: 11 }}>
          {isCorrection ? "Correction" : LABEL.get(event.event_type) ?? event.event_type}
        </span>
        {event.subject_label && (
          <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{event.subject_label}</span>
        )}
        {/* Where a row came from, when it was not typed here. The point is that
            a scientist can always tell their own words from a mirrored write. */}
        {event.source_type && (
          <span style={{ fontSize: 11, color: "var(--ink-mute)" }}>
            via {event.source_type.replace(/_/g, " ")}
          </span>
        )}
      </div>
      <p style={{ margin: "2px 0 0", fontSize: 13.5 }}>{entryText(event)}</p>
    </div>
  );
}

export function TimelinePanel({
  experimentId,
  events,
  addEntry,
}: {
  experimentId: string;
  events: TimelineEventView[];
  addEntry: (
    experimentId: string,
    text: string,
    eventType: TimelineEventType
  ) => Promise<ActionResult<TimelineEvent>>;
}) {
  const { run, pending } = useRunAction();
  const [items, setItems] = useStickyState(events);
  const [eventType, setEventType] = useState<TimelineEventType>("observed");
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // Grouped by day, newest first. The service already sorts and folds
  // corrections under what they correct.
  const byDay = new Map<string, TimelineEventView[]>();
  for (const e of items) {
    const day = e.occurred_at.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }

  return (
    <div className="obs-box glass">
      <h4 style={{ margin: "0 0 8px" }}>Log</h4>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <textarea
          ref={boxRef}
          rows={2}
          placeholder="What happened?"
          aria-label="Log entry"
          style={{ flex: 1 }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as TimelineEventType)}
            aria-label="Entry type"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            disabled={pending}
            aria-busy={pending}
            onClick={() => {
              const text = boxRef.current?.value.trim();
              if (!text) return;
              run(async () => {
                const res = await addEntry(experimentId, text, eventType);
                if (res.ok && res.data) {
                  const row = res.data;
                  // From the server's row: occurred_at is the database's now(),
                  // not this workstation's clock.
                  if (boxRef.current) boxRef.current.value = "";
                  setItems((cur) => [{ ...row, actorName: "You", corrections: [] }, ...cur]);
                }
                return res;
              });
            }}
          >
            {pending && <Spinner />}
            Log
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          Nothing logged yet. Anything you record here — and anything recorded through the panels
          below — appears in this one list, in order.
        </p>
      ) : (
        <div style={{ marginTop: 14 }}>
          {[...byDay.entries()].map(([day, dayEvents]) => (
            <div key={day} style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 11.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--ink-mute)",
                  borderBottom: "1px solid var(--border, #2a2a2a22)",
                  paddingBottom: 3,
                  marginBottom: 6,
                }}
              >
                {fmtDay(dayEvents[0].occurred_at)}
              </div>
              {dayEvents.map((e) => (
                <div key={e.id} style={{ padding: "6px 0" }}>
                  <Entry event={e} />
                  {/* §10.2 — a correction never replaces what it corrects; both
                      stay on screen, so the original claim can never be read
                      without the thing that corrects it. */}
                  {e.corrections.map((c) => (
                    <Entry key={c.id} event={c} isCorrection />
                  ))}
                  <span style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>{e.actorName}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
