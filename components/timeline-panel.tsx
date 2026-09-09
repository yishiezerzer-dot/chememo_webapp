"use client";

import { useRef, useState } from "react";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import { useStickyState } from "@/lib/use-sticky-state";
import type { ActionResult } from "@/lib/types";
import { EVENT_TYPE_LABELS, type TimelineEventType } from "@/lib/timeline/event-types";
import { classifyLogText, type Classification } from "@/lib/timeline/classify";
import type { ProposedEntry } from "@/lib/timeline/file-entry";
import type { FileResult } from "@/app/(app)/experiments/[id]/filer-actions";
import type { TimelineEvent, TimelineEventView } from "@/lib/timeline/service";

const LABEL = new Map(EVENT_TYPE_LABELS.map((t) => [t.value, t.label]));

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
  experimentName,
  proposeEntries,
  commitEntries,
}: {
  experimentId: string;
  events: TimelineEventView[];
  addEntry: (
    experimentId: string,
    text: string,
    eventType: TimelineEventType
  ) => Promise<ActionResult<TimelineEvent>>;
  experimentName: string;
  /** Absent when no AI provider is configured — the composer just logs directly. */
  proposeEntries?: (
    experimentId: string,
    text: string,
    context: { experimentName: string; recentEntries: string[] }
  ) => Promise<ActionResult<FileResult>>;
  commitEntries?: (experimentId: string, entries: ProposedEntry[]) => Promise<ActionResult<TimelineEvent[]>>;
}) {
  const { run, pending } = useRunAction();
  const [items, setItems] = useStickyState(events);
  const [eventType, setEventType] = useState<TimelineEventType>("observed");
  // Once someone picks a type by hand, stop moving it under them.
  const [typeOverridden, setTypeOverridden] = useState(false);
  const [reading, setReading] = useState<Classification | null>(null);
  // What the filer proposed, awaiting the scientist's agreement. Nothing here
  // has been written; that is the point of the step.
  const [proposal, setProposal] = useState<ProposedEntry[] | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // Runs on every keystroke and costs nothing: no network, no key, no model.
  // This is the mechanism the log is built on -- the AI filer improves how
  // much it catches, and the notebook works identically without one.
  function reread(text: string) {
    const c = text.trim() ? classifyLogText(text) : null;
    setReading(c);
    if (c && !typeOverridden) setEventType(c.eventType);
  }

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
          onChange={(e) => reread(e.target.value)}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <select
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value as TimelineEventType);
              setTypeOverridden(true);
            }}
            aria-label="Entry type"
          >
            {EVENT_TYPE_LABELS.map((t) => (
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

              // With a filer available, the note goes for organising first and
              // nothing is written until the scientist agrees. Without one, it
              // is logged directly -- same button, same place, one fewer step.
              if (proposeEntries) {
                run(async () => {
                  const res = await proposeEntries(experimentId, text, {
                    experimentName,
                    recentEntries: items.slice(0, 5).map(entryText),
                  });
                  if (res.ok && res.data) {
                    if (res.data.written) {
                      // The AI path failed and the words were saved verbatim
                      // rather than lost. Show them in the log immediately.
                      const row = res.data.written;
                      if (boxRef.current) boxRef.current.value = "";
                      setReading(null);
                      setItems((cur) => [{ ...row, actorName: "You", corrections: [] }, ...cur]);
                    } else {
                      setProposal(res.data.proposal);
                    }
                  }
                  return res;
                });
                return;
              }

              run(async () => {
                const res = await addEntry(experimentId, text, eventType);
                if (res.ok && res.data) {
                  const row = res.data;
                  // From the server's row: occurred_at is the database's now(),
                  // not this workstation's clock.
                  if (boxRef.current) boxRef.current.value = "";
                  setReading(null);
                  setTypeOverridden(false);
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

      {/* What was understood, before anything is written. Shown rather than
          silently applied: the type is a claim about the record, and a claim
          a scientist cannot see is one they cannot correct. */}
      {reading && (
        <div
          style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}
          aria-live="polite"
        >
          <span style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>
            Filing as <b>{LABEL.get(eventType) ?? eventType}</b>
            {!typeOverridden && reading.matchedOn ? ` — from “${reading.matchedOn}”` : ""}
          </span>
          {reading.ph !== null && <span className="chip" style={{ fontSize: 11 }}>pH {reading.ph}</span>}
          {reading.quantities.map((q) => (
            <span key={`${q.kind}-${q.unitCode}`} className="chip" style={{ fontSize: 11 }}>
              {q.value} {q.unitCode === "Cel" ? "°C" : q.unitCode}
            </span>
          ))}
          {reading.mz.map((m) => (
            <span key={m} className="chip" style={{ fontSize: 11 }}>
              m/z {m}
            </span>
          ))}
          {reading.subjects.map((sub) => (
            <span key={sub} className="chip" style={{ fontSize: 11 }}>
              {sub}
            </span>
          ))}
        </div>
      )}

      {proposal && (
        <div className="obs-box glass" style={{ marginTop: 10 }}>
          <b style={{ fontSize: 13 }}>
            {proposal.length === 1 ? "Filing this as one entry" : `Filing this as ${proposal.length} entries`}
          </b>
          <p className="sec-sub" style={{ margin: "2px 0 8px" }}>
            Nothing is saved yet. Change a type, or discard any line you disagree with.
          </p>
          {proposal.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0" }}>
              <select
                value={e.eventType}
                aria-label={`Type for “${(e.action ?? e.observation ?? "").slice(0, 40)}”`}
                onChange={(ev) =>
                  setProposal((cur) =>
                    (cur ?? []).map((p) =>
                      p.id === e.id ? { ...p, eventType: ev.target.value as TimelineEventType } : p
                    )
                  )
                }
              >
                {EVENT_TYPE_LABELS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p style={{ margin: 0, fontSize: 13.5, flex: 1 }}>
                {[e.action, e.observation, e.deviationNote, e.nextAction].filter(Boolean).join(" — ")}
                {e.subjectLabel && (
                  <span className="chip" style={{ fontSize: 11, marginLeft: 6 }}>{e.subjectLabel}</span>
                )}
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label="Discard this entry"
                onClick={() => setProposal((cur) => (cur ?? []).filter((p) => p.id !== e.id))}
              >
                ×
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={pending || proposal.length === 0}
              aria-busy={pending}
              onClick={() =>
                commitEntries &&
                run(async () => {
                  const res = await commitEntries(experimentId, proposal);
                  if (res.ok && res.data) {
                    const rows = res.data;
                    if (boxRef.current) boxRef.current.value = "";
                    setProposal(null);
                    setReading(null);
                    setItems((cur) => [
                      ...rows.map((r) => ({ ...r, actorName: "You", corrections: [] })).reverse(),
                      ...cur,
                    ]);
                  }
                  return res;
                })
              }
            >
              {pending && <Spinner />}
              Save {proposal.length === 1 ? "entry" : `${proposal.length} entries`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProposal(null)}>
              Keep editing
            </button>
          </div>
        </div>
      )}

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
