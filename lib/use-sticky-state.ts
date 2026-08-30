"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

// A client copy of server-provided data that a panel can patch the moment a
// mutation returns, without waiting for router.refresh() to commit a new RSC
// tree. Next.js 16's refresh eagerly re-prefetches every in-viewport Link
// (vercel/next.js#93210, still open); under load that stampede can leave the
// current-page payload uncommitted for the whole toBeVisible budget even
// though the write and the server render both succeeded.
//
// THE RECONCILIATION RULE, and where this deliberately differs from the
// version it was adapted from: the local patch holds only until the server
// says something new. The moment `serverValue` differs from the last value
// the server sent, the server wins and the patch is dropped.
//
// The original latched a `dirty` flag on the first patch and then ignored
// server props until unmount, so a panel could keep showing a value the server
// had since contradicted for as long as someone stayed on the page. For a lab
// notebook that is the wrong default. The whole worth of the record is that
// the screen matches it, and every serious bug this project has had -- the
// purity formula, the crew checklist joining on the wrong key, "Mark
// verified", "+ New batch" -- was the UI saying yes while the database said
// no. Optimism that cannot be corrected institutionalises exactly that.
//
// The rule below gives up nothing that matters. A late refresh carrying
// PRE-mutation data does not clobber the patch, because that payload equals
// the last server value already seen -- it is not new, so it is not adopted.
// Only a genuinely changed server value replaces what the user is looking at,
// which is precisely when it should.
//
// Patch from the action's OWN returned row, never from a value assembled on
// the client. That keeps this a display of the outcome rather than a guess at
// it, which is the line that makes the pattern acceptable here at all.
// "Has the server actually moved?" cannot be answered by reference identity.
// A server re-render hands back a brand-new array or object every time, even
// when every row in it is identical, so `!==` reports a change on any refresh
// whatsoever. That threw the local patch away the instant anything re-rendered
// and broke the relationships panel on CI run 33297353128 -- the row was
// appended and then immediately dropped again.
//
// Structural comparison is the honest test, and these payloads are plain
// serialisable rows a few dozen long, so the cost is nil next to a round trip.
function sameServerValue<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    // A cycle or a BigInt: fall back to "treat as changed", which is the safe
    // direction -- the server wins and nothing can be shown contradicting it.
    return false;
  }
}

export function useStickyState<T>(serverValue: T): [T, Dispatch<SetStateAction<T>>] {
  // The last value the server sent, so "the server moved" can be told apart
  // from "React re-rendered us with the same data".
  const [lastServerValue, setLastServerValue] = useState(serverValue);
  const [value, setValue] = useState(serverValue);

  if (!sameServerValue(serverValue, lastServerValue)) {
    setLastServerValue(serverValue);
    setValue(serverValue);
  }

  return [value, setValue];
}
