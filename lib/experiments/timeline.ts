import "server-only";
import { createClient } from "@/lib/supabase/server";
import { diffExperiments, type DiffField } from "@/lib/diff";
import { listLockEvents, listRevisions } from "@/lib/experiments/service";
import type { Experiment, ExperimentFile } from "@/lib/types";

export type TimelineEntry =
  | { kind: "revision"; id: string; created_at: string; actorName: string; diff: DiffField[] }
  | { kind: "lock_event"; id: string; created_at: string; actorName: string; event: "lock" | "reopen" | "restore"; reason: string }
  | { kind: "file"; id: string; created_at: string; actorName: string; label: string; fileKind: "upload" | "link" };

// T1.8 D5 — one merged, chronological feed replacing the two separate
// panels (revisions + lock history) the detail page rendered before.
// Editor/actor identity (D4) is resolved via profiles — its first real UI use.
// Takes the current experiment + its files as already-fetched arguments
// (the detail page already loads both via getExperiment) rather than
// re-querying them — two fewer round trips per page render, which matters
// since this runs on every router.refresh() the step-runner/protocol/
// relationships panels on the same page trigger.
export async function listTimeline(
  experimentId: string,
  current: Experiment,
  files: ExperimentFile[]
): Promise<TimelineEntry[]> {
  const supabase = await createClient();
  const [revisions, lockEvents] = await Promise.all([
    listRevisions(experimentId),
    listLockEvents(experimentId),
  ]);

  const userIds = new Set<string>();
  for (const r of revisions) if (r.editor_id) userIds.add(r.editor_id);
  for (const e of lockEvents) if (e.actor_id) userIds.add(e.actor_id);
  for (const f of files) if (f.uploaded_by) userIds.add(f.uploaded_by);

  const { data: profiles } = userIds.size
    ? await supabase.from("profiles").select("id, full_name, initials").in("id", [...userIds])
    : { data: [] as { id: string; full_name: string | null; initials: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.initials || "Someone"]));
  const nameFor = (id: string | null) => (id ? nameById.get(id) ?? "Someone" : "Someone");

  // Revisions are stored oldest-context-first in the array (listRevisions
  // orders newest first); each row IS the state right before the edit that
  // produced the next-newer snapshot (or the current record, for the newest).
  const revisionEntries: TimelineEntry[] = revisions
    .map((r, i) => {
      const after = i === 0 ? current : revisions[i - 1].snapshot;
      return {
        kind: "revision" as const,
        id: r.id,
        created_at: r.created_at,
        actorName: nameFor(r.editor_id),
        diff: diffExperiments(r.snapshot, after),
      };
    })
    // D1's trigger fix prevents new no-op revisions, but this filters any
    // already sitting in the DB from before the fix shipped.
    .filter((entry) => entry.diff.length > 0);

  const lockEntries: TimelineEntry[] = lockEvents.map((e) => ({
    kind: "lock_event",
    id: e.id,
    created_at: e.created_at,
    actorName: nameFor(e.actor_id),
    event: e.event,
    reason: e.reason,
  }));

  const fileEntries: TimelineEntry[] = files.map((f) => ({
    kind: "file",
    id: f.id,
    created_at: f.created_at,
    actorName: nameFor(f.uploaded_by),
    label: f.label || f.storage_path || f.url || "file",
    fileKind: f.kind,
  }));

  return [...revisionEntries, ...lockEntries, ...fileEntries].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}
