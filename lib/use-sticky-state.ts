"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

// A client copy of server-provided data that can be patched the moment a
// mutation returns, without waiting for router.refresh() to commit a new
// RSC tree. Next.js 16's refresh eagerly re-prefetches every in-viewport
// Link (vercel/next.js#93210); under CI that stampede can leave the
// current-page payload uncommitted for the whole toBeVisible budget even
// though the write and the server render both succeeded.
//
// Once this copy is patched, it stays sticky until the component unmounts
// (a real navigation). Server props are ignored after that so a late or
// stale refresh cannot wipe the result the user already saw.
export function useStickyState<T>(serverValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [dirty, setDirty] = useState(false);
  const [prev, setPrev] = useState(serverValue);
  const [value, setValue] = useState(serverValue);

  if (!dirty && serverValue !== prev) {
    setPrev(serverValue);
    setValue(serverValue);
  }

  function setSticky(update: SetStateAction<T>) {
    setDirty(true);
    setValue(update);
  }

  return [value, setSticky];
}
