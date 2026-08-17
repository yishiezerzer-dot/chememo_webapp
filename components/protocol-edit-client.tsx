"use client";

import { useActionState } from "react";
import type { ActionResult, CriticalParameter, KnownFailureMode, ProtocolStep, QuantityKind } from "@/lib/types";
import { ProtocolVersionEditor } from "@/components/protocol-version-editor";
import { Spinner } from "@/components/spinner";

export function ProtocolEditClient({
  action,
  initial,
  quantityKinds,
}: {
  action: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  initial: {
    purpose: string | null;
    scope: string | null;
    required_materials: string | null;
    equipment: string | null;
    safety_notes: string | null;
    qc_checks: string | null;
    critical_parameters: CriticalParameter[];
    known_failure_modes: KnownFailureMode[];
    steps: ProtocolStep[];
  };
  quantityKinds: QuantityKind[];
}) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className="obs-box glass" style={{ maxWidth: 720 }}>
      {state && !state.ok && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <ProtocolVersionEditor initial={initial} quantityKinds={quantityKinds} />
      <button type="submit" className="btn btn-primary" disabled={isPending} aria-busy={isPending}>
        {isPending && <Spinner />}
        Save protocol version
      </button>
    </form>
  );
}
