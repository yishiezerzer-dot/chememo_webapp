"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
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
  createRelationship: (targetExperimentId: string, type: RelationshipType) => Promise<ActionResult>;
  deleteRelationship: (relationshipId: string) => Promise<ActionResult>;
  addToSeries: (seriesId: string) => Promise<ActionResult>;
  removeFromSeries: (seriesId: string) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const targetRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<RelationshipType>("replicate_of");
  const memberSeriesIds = new Set(memberSeries.map((s) => s.id));
  const availableSeries = allSeries.filter((s) => !memberSeriesIds.has(s.id));
  const [seriesToAdd, setSeriesToAdd] = useState("");

  function run(action: () => Promise<ActionResult>) {
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error, "error");
      else router.refresh();
    });
  }

  return (
    <div className="obs-box glass">
      <h4>Relationships</h4>
      {relationships.length === 0 ? (
        <p className="muted" style={{ margin: "0 0 12px" }}>
          No relationships recorded.
        </p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {Object.entries(
            relationships.reduce<Record<string, RelationshipView[]>>((groups, r) => {
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
                    onClick={() => run(() => deleteRelationship(r.relationship.id))}
                  >
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
          onClick={() => {
            const target = targetRef.current?.value.trim();
            if (!target) return;
            run(async () => {
              const res = await createRelationship(target, type);
              if (res.ok && targetRef.current) targetRef.current.value = "";
              return res;
            });
          }}
        >
          + Add relationship
        </button>
      </div>

      <h4 style={{ fontSize: 13, color: "var(--ink-mute)", margin: "0 0 8px" }}>Series membership</h4>
      {memberSeries.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {memberSeries.map((s) => (
            <span key={s.id} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 6 }}>
              <a href={`/series/${s.id}`} style={{ color: "inherit" }}>
                {s.name}
              </a>
              <b onClick={() => run(() => removeFromSeries(s.id))} style={{ cursor: "pointer" }}>
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
            onClick={() => run(() => addToSeries(seriesToAdd))}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
