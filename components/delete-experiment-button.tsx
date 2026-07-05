"use client";

import { useState } from "react";

export function DeleteExperimentButton({
  action,
}: {
  action: () => void | Promise<void>;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setArmed(true)}
      >
        Delete
      </button>
    );
  }

  return (
    <form action={action} style={{ display: "inline-flex", gap: 8 }}>
      <button
        type="submit"
        className="btn btn-sm"
        style={{ borderColor: "var(--rose)", color: "var(--rose)" }}
      >
        Confirm delete
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setArmed(false)}
      >
        Cancel
      </button>
    </form>
  );
}
