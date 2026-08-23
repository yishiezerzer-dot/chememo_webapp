"use client";

import { useState } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import type { ActionResult } from "@/lib/types";

// Roughly thirty panels had hand-rolled this exact helper (five adopted the
// hook first, the rest followed on 2026-08-23), and every copy awaited the
// action bare. A server action can *reject* rather than return { ok: false }
// -- requireUser() runs before an action's own try block, so an expired
// session is the everyday case -- and an unguarded rejection escapes to
// app/(app)/error.tsx, replacing the whole route segment (and the user's
// place in it) with a redacted "Something went wrong" panel.
//
// The catch below turns that into a toast on the button that was clicked.
// Behaviour is otherwise identical to the copies it replaces: pendingKey for
// per-button spinners (2026-08-17's convention), router.refresh() on success
// because revalidatePath only marks the route stale, then the optional
// `after` callback.
//
// `pending` is plain state rather than useTransition deliberately. Every copy
// of this helper ran `start(async () => { await action(); router.refresh() })`
// -- but a transition only scopes the updates scheduled *before* its first
// await, so the refresh dispatched afterwards lands in an already-sealed
// scope. When that happens the transition never settles: the button stays
// disabled with its spinner running forever, and the refreshed tree is never
// committed, so the panel still shows the pre-mutation data even though the
// write succeeded. It is a race, invisible on a fast machine and near-certain
// on a slow one -- CI has failed on it continuously since 2026-08-03, every
// failure being "clicked, wrote to the database, UI never updated".
export function useRunAction() {
  const [pending, setPending] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  // Positional (action, key, after) deliberately matches the signature the
  // hand-rolled copies already had, so adopting the hook changes no call site.
  async function run(action: () => Promise<ActionResult>, key?: string, after?: () => void) {
    setPendingKey(key ?? null);
    setPending(true);
    try {
      const res = await action();
      if (!res.ok) {
        showToast(res.error ?? "Something went wrong.", "error");
        return;
      }
      router.refresh();
      after?.();
    } catch (e) {
      // A server action that redirects on success (createExperiment,
      // createDraftExperimentFromPlan, deleteExperiment, createWorkspace)
      // signals it by REJECTING with a framework control-flow error. Before
      // these panels adopted the hook they had no catch at all, so that
      // rejection reached Next untouched; catching it turned every successful
      // create into a "Something went wrong" toast on the page it had just
      // navigated to. Found by click-through on 2026-08-23, on the very first
      // record created. unstable_rethrow re-throws exactly those and nothing
      // else, so real failures still toast.
      unstable_rethrow(e);
      showToast("Something went wrong. Please try again.", "error");
    } finally {
      setPending(false);
      setPendingKey(null);
    }
  }

  // Loader-shaped counterpart. Several surfaces await an action for its *data*
  // rather than for an ActionResult -- a disclosure that fetches its rows on
  // first open (materials, samples), or an AI panel that renders what came
  // back. Those awaits were bare too, and sat inside the same sealed
  // transition, so they carry both defects: a rejection killed the route
  // segment, and the control could stay disabled for good. Sharing
  // `pending`/`pendingKey` with `run` is deliberate -- a row's load and its
  // buttons are one busy state as far as the person clicking is concerned.
  //
  // `onLoaded` receives whatever the action resolved to, `null` included: the
  // AI panels treat null as "couldn't generate that" and say so inline, which
  // is a different thing from the action failing outright.
  async function load<T>(action: () => Promise<T>, onLoaded: (value: T) => void, key?: string) {
    setPendingKey(key ?? null);
    setPending(true);
    try {
      onLoaded(await action());
    } catch (e) {
      // Same reason as run()'s catch: plan-client's commit and the experiment
      // form both go through here, and both redirect on success.
      unstable_rethrow(e);
      showToast("Something went wrong. Please try again.", "error");
    } finally {
      setPending(false);
      setPendingKey(null);
    }
  }

  return { run, load, pending, pendingKey };
}
