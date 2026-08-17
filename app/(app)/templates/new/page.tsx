"use client";

import { useActionState } from "react";
import { createNewTemplate } from "../actions";
import { Spinner } from "@/components/spinner";
import type { ActionResult } from "@/lib/types";

export default function NewTemplatePage() {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(createNewTemplate, null);

  return (
    <div>
      <span className="eyebrow">Templates</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        New template
      </h2>
      <form action={formAction} className="obs-box glass" style={{ maxWidth: 480 }}>
        {state && !state.ok && (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        )}
        <div className="field">
          <label>Name *</label>
          <input name="name" required placeholder="Wet-dry cycling — standard" />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea name="description" rows={2} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isPending} aria-busy={isPending}>
          {isPending && <Spinner />}
          Create and add defaults
        </button>
      </form>
    </div>
  );
}
