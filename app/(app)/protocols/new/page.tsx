"use client";

import { useActionState } from "react";
import { createNewProtocol } from "../actions";
import type { ActionResult } from "@/lib/types";

export default function NewProtocolPage() {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(createNewProtocol, null);

  return (
    <div>
      <span className="eyebrow">Protocols</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        New protocol
      </h2>
      <form action={formAction} className="obs-box glass" style={{ maxWidth: 480 }}>
        {state && !state.ok && (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        )}
        <div className="field">
          <label>Name *</label>
          <input name="name" required placeholder="Wet-dry dry-down, standard" />
        </div>
        <button type="submit" className="btn btn-primary">
          Create and add steps
        </button>
      </form>
    </div>
  );
}
