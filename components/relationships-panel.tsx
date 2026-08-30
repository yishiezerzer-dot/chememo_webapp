"use client";

import { useRef, useState } from "react";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import { useStickyState } from "@/lib/use-sticky-state";
import { RELATIONSHIP_TYPES, RELATIONSHIP_LABEL } from "@/lib/types";
import type { ActionResult, ExperimentSeries, RelationshipType } from "@/lib/types";
import type { RelationshipView } from "@/lib/relationships/service";

export function RelationshipsPanel({
  experimentId,
  relationships,
  allSeries,
  memberSeries,
  createRelationship,
  deleteRelationship,
  addToSeries,
  removeFromSeries,
}: {
  experimentId: string;
  relationships: RelationshipView[];
  allSeries: ExperimentSeries[];
  memberSeries: ExperimentSeries[];
  createRelationship: (targetExperimentId: string, type: RelationshipType) => Promise<ActionResult<RelationshipView>>;
  deleteRelationship: (relationshipId: string) => Promise<ActionResult>;
  addToSeries: (seriesId: string) => Promise<ActionResult>;
  removeFromSeries: (seriesId: string) => Promise<ActionResult>;
}) {
  const { run, pending, pendingKey } = useRunAction();
  const targetRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<RelationshipType>("replicate_of");
  const [items, setItems] = useStickyState(relationships);
  const [seriesMembership, setSeriesMembership] = useStickyState(memberSeries);
  const memberSeriesIds = new Set(seriesMembership.map((s) => s.id));
  const availableSeries = allSeries.filter((s) => !memberSeriesIds.has(s.id));
  const [seriesToAdd, setSeriesToAdd] = useState("");

  return (
    <div className="obs-box glass">
      <h4>Relationships</h4>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: "0 0 12px" }}>
          No relationships recorded.
        </p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {Object.entries(
            items.reduce<Record<string, RelationshipView[]>>((groups, r) => {
              (groups[r.relationship.relationship_type] ??= []).push(r);
              return groups;
            }, {})
          ).map(([type, group]) => (
            <div key={type} style={{ marginBottom: 8 }}>
              {group.map((r) => (
                <div key={r.relationship.id} className="act-row">
                  <span className="act-dot"></span>
                  <span style={{ fontSize: 13 }}>
                    {r.label} <a href={`/experiments/${r.otherExperiment.id}`}>{r.otherExperiment.id} — {r.otherExperiment.name}</a>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: "auto" }}
                    disabled={pending}
                    aria-busy={pending && pendingKey === r.relationship.id}
                    onClick={() =>
                      run(async () => {
                        const res = await deleteRelationship(r.relationship.id);
                        if (res.ok) {
                          setItems((cur) => cur.filter((x) => x.relationship.id !== r.relationship.id));
                        }
                        return res;
                      }, r.relationship.id)
                    }
                  >
                    {pending && pendingKey === r.relationship.id && <Spinner />}
                    Remove
                  </button>
                </div>
              ))}
              {/* T2.9 D4 — compare this experiment against every related
                  experiment of this one type, side by side. */}
              <a
                href={`/experiments/compare?ids=${[experimentId, ...group.map((r) => r.otherExperiment.id)].join(",")}`}
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 4 }}
              >
                Compare {RELATIONSHIP_LABEL[type as RelationshipType]} ({group.length + 1})
              </a>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input ref={targetRef} placeholder="Other experiment ID (e.g. EXP-014)" style={{ maxWidth: 200 }} />
        <select value={type} onChange={(e) => setType(e.target.value as RelationshipType)}>
          {RELATIONSHIP_TYPES.map((t) => (
            <option key={t} value={t}>
              {RELATIONSHIP_LABEL[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          aria-busy={pending && pendingKey === "add-relationship"}
          onClick={() => {
            const target = targetRef.current?.value.trim();
            if (!target) return;
            run(async () => {
              const res = await createRelationship(target, type);
              if (res.ok) {
                if (res.data) setItems((cur) => [...cur, res.data as RelationshipView]);
                if (targetRef.current) targetRef.current.value = "";
              }
              return res;
            }, "add-relationship");
          }}
        >
          {pending && pendingKey === "add-relationship" && <Spinner />}
          + Add relationship
        </button>
      </div>

      <h4 style={{ fontSize: 13, color: "var(--ink-mute)", margin: "0 0 8px" }}>Series membership</h4>
      {seriesMembership.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {seriesMembership.map((s) => (
            <span key={s.id} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 6 }}>
              <a href={`/series/${s.id}`} style={{ color: "inherit" }}>
                {s.name}
              </a>
              <b
                onClick={() =>
                  run(async () => {
                    const res = await removeFromSeries(s.id);
                    if (res.ok) setSeriesMembership((cur) => cur.filter((x) => x.id !== s.id));
                    return res;
                  }, `series-${s.id}`)
                }
                style={{ cursor: "pointer" }}
              >
                ×
              </b>
            </span>
          ))}
        </div>
      )}
      {availableSeries.length > 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          <select value={seriesToAdd} onChange={(e) => setSeriesToAdd(e.target.value)}>
            <option value="">Add to series…</option>
            {availableSeries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending || !seriesToAdd}
            aria-busy={pending && pendingKey === "add-to-series"}
            onClick={() =>
              run(async () => {
                const id = seriesToAdd;
                const res = await addToSeries(id);
                if (res.ok) {
                  const added = allSeries.find((s) => s.id === id);
                  if (added) setSeriesMembership((cur) => [...cur, added]);
                  setSeriesToAdd("");
                }
                return res;
              }, "add-to-series")
            }
          >
            {pending && pendingKey === "add-to-series" && <Spinner />}
            Add
          </button>
        </div>
      )}
    </div>
  );
}
