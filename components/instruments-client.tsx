"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { METHOD_TYPES } from "@/lib/types";
import type { ActionResult, Instrument, InstrumentMethod, MethodType } from "@/lib/types";
import { createInstrumentAction, createMethodAction, getInstrumentMethodsAction } from "@/app/(app)/instruments/actions";

function InstrumentRow({ instrument }: { instrument: Instrument }) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [methods, setMethods] = useState<InstrumentMethod[] | null>(null);
  const [methodName, setMethodName] = useState("");
  const [methodType, setMethodType] = useState<MethodType>("lc_ms");

  async function load() {
    if (!open) setMethods(await getInstrumentMethodsAction(instrument.id));
    setOpen((o) => !o);
  }

  function run(action: () => Promise<ActionResult>) {
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error, "error");
      else {
        router.refresh();
        setMethods(await getInstrumentMethodsAction(instrument.id));
        setMethodName("");
      }
    });
  }

  return (
    <div className="obs-box glass" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <b>{instrument.name}</b>
          {instrument.model && <span className="muted"> — {instrument.model}</span>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={load}>
          {open ? "Collapse" : "Methods"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          {(methods ?? []).map((m) => (
            <div key={m.id} className="act-row">
              <span className="act-dot"></span>
              <span style={{ fontSize: 13 }}>
                {m.name} <span className="chip">{m.method_type}</span>
              </span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input placeholder="Method name" value={methodName} onChange={(e) => setMethodName(e.target.value)} />
            <select value={methodType} onChange={(e) => setMethodType(e.target.value as MethodType)}>
              {METHOD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending || !methodName.trim()}
              onClick={() => run(() => createMethodAction(instrument.id, methodName, methodType))}
            >
              + Add method
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function InstrumentsClient({ instruments }: { instruments: Instrument[] }) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);

  return (
    <div style={{ marginTop: 16 }}>
      <div className="detail-head" style={{ marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>Instruments</h4>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNew((v) => !v)}>
          {showNew ? "Cancel" : "+ New instrument"}
        </button>
      </div>

      {showNew && (
        <form
          className="obs-box glass"
          style={{ marginBottom: 16 }}
          action={(formData) =>
            start(async () => {
              const res = await createInstrumentAction(null, formData);
              if (!res.ok) showToast(res.error ?? "Something went wrong.", "error");
              else {
                setShowNew(false);
                router.refresh();
              }
            })
          }
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input name="name" placeholder="Instrument name" required />
            <input name="model" placeholder="Model" />
            <input name="serial_number" placeholder="Serial #" />
            <input name="location" placeholder="Location" />
          </div>
          <button type="submit" className="btn btn-sm" style={{ marginTop: 8 }} disabled={pending}>
            Save instrument
          </button>
        </form>
      )}

      {instruments.length === 0 ? (
        <p className="muted">No instruments yet.</p>
      ) : (
        instruments.map((i) => <InstrumentRow key={i.id} instrument={i} />)
      )}
    </div>
  );
}
