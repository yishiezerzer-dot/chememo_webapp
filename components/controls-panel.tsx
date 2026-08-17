"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import { CONTROL_TYPES } from "@/lib/types";
import type { ActionResult, Control, ControlType } from "@/lib/types";
import { createControlAction, deleteControlAction } from "@/app/(app)/experiments/[id]/conditions-actions";
import { requiredControlsPresent } from "@/lib/conditions/rules";

export function ControlsPanel({
  experimentId,
  controls,
  hasConditionProgram,
}: {
  experimentId: string;
  controls: Control[];
  hasConditionProgram: boolean;
}) {
  const [pending, start] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();
  const [controlType, setControlType] = useState<ControlType>(CONTROL_TYPES[0]);
  const [description, setDescription] = useState("");

  const check = requiredControlsPresent(controls, hasConditionProgram);

  function run(action: () => Promise<ActionResult>, key: string, after?: () => void) {
    setPendingKey(key);
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error ?? "Something went wrong.", "error");
      else {
        router.refresh();
        after?.();
      }
    });
  }

  return (
    <div className="obs-box glass">
      <div className="detail-head" style={{ marginBottom: 8 }}>
        <h4 style={{ margin: 0 }}>Controls</h4>
        <span className={`chip${check.satisfied ? "" : " warn"}`}>
          {check.satisfied ? "Required controls present" : `Missing: ${check.missing.join(", ")}`}
        </span>
      </div>

      {controls.length === 0 ? (
        <p className="muted">No controls recorded yet.</p>
      ) : (
        controls.map((c) => (
          <div key={c.id} className="act-row">
            <span className="act-dot"></span>
            <span style={{ fontSize: 13 }}>
              <span className="chip">{c.control_type}</span> {c.description}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto" }}
              disabled={pending}
              aria-busy={pending && pendingKey === c.id}
              onClick={() => run(() => deleteControlAction(experimentId, c.id), c.id)}
            >
              {pending && pendingKey === c.id && <Spinner />}
              Delete
            </button>
          </div>
        ))
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <select value={controlType} onChange={(e) => setControlType(e.target.value as ControlType)}>
          {CONTROL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          aria-busy={pending && pendingKey === "add-control"}
          onClick={() =>
            run(() => createControlAction(experimentId, controlType, description), "add-control", () => setDescription(""))
          }
        >
          {pending && pendingKey === "add-control" && <Spinner />}
          + Add control
        </button>
      </div>
    </div>
  );
}
