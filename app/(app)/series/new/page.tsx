"use client";

import { useActionState } from "react";
import { createNewSeries } from "../actions";
import { Spinner } from "@/components/spinner";
import type { ActionResult } from "@/lib/types";

export default function NewSeriesPage() {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(createNewSeries, null);

  return (
    <div>
      <span className="eyebrow">Series</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        New series
      </h2>
      <form action={formAction} className="obs-box glass" style={{ maxWidth: 480 }}>
        {state && !state.ok && (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        )}
        <div className="field">
          <label>Name *</label>
          <input name="name" required placeholder="Wet-dry cycling dose-response, Zn" />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea name="description" rows={2} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isPending} aria-busy={isPending}>
          {isPending && <Spinner />}
          Create series
        </button>
      </form>
    </div>
  );
}
