"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import type { ActionResult } from "@/lib/types";

// Five panels had hand-rolled this exact helper, and every copy awaited the
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

  // Positional (action, key, after) deliberately matches the signature all
  // five copies already had, so adopting the hook changes no call site.
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
    } catch {
      showToast("Something went wrong. Please try again.", "error");
    } finally {
      setPending(false);
      setPendingKey(null);
    }
  }

  return { run, pending, pendingKey };
}
