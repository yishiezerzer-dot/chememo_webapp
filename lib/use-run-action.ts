"use client";

import { useState, useTransition } from "react";
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
export function useRunAction() {
  const [pending, start] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  // Positional (action, key, after) deliberately matches the signature all
  // five copies already had, so adopting the hook changes no call site.
  function run(action: () => Promise<ActionResult>, key?: string, after?: () => void) {
    setPendingKey(key ?? null);
    start(async () => {
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
      }
    });
  }

  return { run, pending, pendingKey };
}
