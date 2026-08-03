"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { StatusBadge } from "@/components/status-badge";
import type { ActionResult, Experiment } from "@/lib/types";

export function SeriesDetailClient({
  members,
  addMember,
  removeMember,
}: {
  members: Experiment[];
  addMember: (experimentId: string) => Promise<ActionResult>;
  removeMember: (experimentId: string) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function run(action: () => Promise<ActionResult>) {
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error, "error");
      else router.refresh();
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input ref={inputRef} placeholder="Experiment ID (e.g. EXP-014)" style={{ maxWidth: 220 }} />
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => {
            const id = inputRef.current?.value.trim();
            if (!id) return;
            run(async () => {
              const res = await addMember(id);
              if (res.ok && inputRef.current) inputRef.current.value = "";
              return res;
            });
          }}
        >
          Add experiment
        </button>
      </div>

      {members.length === 0 ? (
        <p className="muted">No members yet.</p>
      ) : (
        <div className="table-scroll">
          <div className="table-scroll-inner" tabIndex={0} role="region" aria-label="Series members, scrollable">
            <table className="exp-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>pH</th>
                  <th>Cycles</th>
                  <th>Compounds</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((e) => (
                  <tr key={e.id}>
                    <td className="td-id">{e.id}</td>
                    <td>{e.name}</td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="muted">{e.date ?? "—"}</td>
                    <td className="td-ph">{e.ph ?? "—"}</td>
                    <td className="td-center muted">{e.cycles ?? "—"}</td>
                    <td>{e.compounds.join(", ") || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={pending}
                        onClick={() => run(() => removeMember(e.id))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
