"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseExperimentForm } from "@/lib/experiment-form-parse";
import { saveDraftAction } from "@/app/(app)/drafts-actions";
import type { DraftKey } from "@/lib/types";

export type AutosaveState = "idle" | "saving" | "saved" | "offline" | "conflict";

const DEBOUNCE_MS = 2500;

function localStorageKey(key: DraftKey): string {
  return "targetExperimentId" in key
    ? `chememo:draft:exp:${key.targetExperimentId}`
    : `chememo:draft:${key.clientDraftId}`;
}

export type LocalDraft = { fields: Record<string, unknown>; rawNote: string | null; savedAt: number };

export function readLocalDraft(key: DraftKey): LocalDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localStorageKey(key));
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null;
  }
}

// T1.3 — debounced autosave (D3): localStorage is written synchronously on
// every change (closes the gap between keystrokes and the next server tick),
// the server draft is written on a ~2.5s debounce (the cross-device/
// cleared-localStorage backstop). `getRawNote` is a callback rather than a
// plain value so the hook always reads PasteNotes' latest text at save time
// without needing PasteNotes' textarea to live inside this <form> (it's a
// sibling, not a descendant, so it can't be captured via FormData).
export function useAutosave({
  formRef,
  draftKey,
  getRawNote,
  enabled = true,
}: {
  formRef: React.RefObject<HTMLFormElement | null>;
  draftKey: DraftKey;
  getRawNote?: () => string | null;
  enabled?: boolean;
}) {
  const [state, setState] = useState<AutosaveState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const writeLocal = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const fields = parseExperimentForm(new FormData(form));
    const rawNote = getRawNote?.() ?? null;
    try {
      window.localStorage.setItem(
        localStorageKey(draftKey),
        JSON.stringify({ fields, rawNote, savedAt: Date.now() })
      );
    } catch {
      // localStorage can throw (private browsing, quota) — the server
      // draft below is still attempted, so this is a soft-fail only.
    }
  }, [draftKey, formRef, getRawNote]);

  const flush = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const fields = parseExperimentForm(new FormData(form));
    const rawNote = getRawNote?.() ?? null;
    const baseUpdatedAt = (form.elements.namedItem("base_updated_at") as HTMLInputElement | null)?.value || null;
    setState("saving");
    saveDraftAction(draftKey, fields, rawNote, baseUpdatedAt)
      .then((res) => {
        dirtyRef.current = false;
        setState(res.ok ? "saved" : "offline");
      })
      .catch(() => setState("offline"));
  }, [draftKey, formRef, getRawNote]);

  useEffect(() => {
    if (!enabled) return;
    const form = formRef.current;
    if (!form) return;
    function onChange() {
      dirtyRef.current = true;
      writeLocal();
      setState("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    }
    form.addEventListener("input", onChange);
    form.addEventListener("change", onChange);
    return () => {
      form.removeEventListener("input", onChange);
      form.removeEventListener("change", onChange);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, flush, formRef, writeLocal]);

  // Re-run when the raw note (PasteNotes, outside this form) changes too.
  useEffect(() => {
    if (!enabled) return;
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getRawNote?.()]);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (dirtyRef.current) e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const markConflict = useCallback(() => setState("conflict"), []);
  const markSaved = useCallback(() => {
    dirtyRef.current = false;
    setState("saved");
  }, []);

  return { state, markConflict, markSaved };
}
