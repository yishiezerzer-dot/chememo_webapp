"use client";

import { useActionState, useState } from "react";
import { METHOD_OPTIONS, type ActionResult, type Experiment, type Project } from "@/lib/types";

type Props = {
  projects: Project[];
  action: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  // Partial so LLM-extracted fields (Phase 9) can pre-fill the form.
  initial?: Partial<Experiment>;
  submitLabel: string;
  // Distinct compound/metal values for autocomplete (optional).
  vocab?: { compounds: string[]; metals: string[] };
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="field-error" role="alert">
      {message}
    </p>
  );
}

function TagField({
  name,
  label,
  metal,
  initial,
  suggestions = [],
}: {
  name: string;
  label: string;
  metal?: boolean;
  initial: string[];
  suggestions?: string[];
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const listId = `dl-${name}`;

  function add(value?: string) {
    const v = (value ?? draft).trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setDraft("");
  }

  // Suggest values not already picked; the browser filters by what's typed.
  const options = suggestions.filter((s) => !tags.includes(s));

  return (
    <div className="field">
      <label>{label}</label>
      <input type="hidden" name={name} value={tags.join(",")} />
      <div className="taginput" onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}>
        {tags.map((t) => (
          <span key={t} className={`ti${metal ? " metal" : ""}`}>
            {t}
            <b onClick={() => setTags(tags.filter((x) => x !== t))}>×</b>
          </span>
        ))}
        <input
          value={draft}
          list={options.length ? listId : undefined}
          onChange={(e) => {
            const v = e.target.value;
            // Selecting a datalist option fires change with the full value.
            if (options.includes(v)) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && tags.length) {
              setTags(tags.slice(0, -1));
            }
          }}
          onBlur={() => add()}
          placeholder="type and press Enter"
        />
        {options.length > 0 && (
          <datalist id={listId}>
            {options.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
    </div>
  );
}

export function ExperimentForm({ projects, action, initial, submitLabel, vocab }: Props) {
  const [methods, setMethods] = useState<string[]>(initial?.methods ?? []);
  const [state, formAction] = useActionState(action, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  function toggleMethod(m: string) {
    setMethods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  return (
    <form action={formAction} className="form-shell">
      <div className="form-sections">
        <section className="fsec glass">
          <h3>
            <span className="sec-num">01</span>Identity
          </h3>
          <p className="sec-sub">What the experiment is and who ran it.</p>
          <div className="field">
            <label>Name *</label>
            <input name="name" required defaultValue={initial?.name ?? ""} placeholder="His + TGA + Zn — wet–dry cycling" />
            <FieldError message={fieldErrors?.name} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Date</label>
              <input type="date" name="date" defaultValue={initial?.date ?? ""} />
              <FieldError message={fieldErrors?.date} />
            </div>
            <div className="field">
              <label>Researcher</label>
              <input name="researcher" defaultValue={initial?.researcher ?? ""} placeholder="Y. Ezerzer" />
              <FieldError message={fieldErrors?.researcher} />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Project</label>
              <select name="project" defaultValue={initial?.project ?? ""}>
                <option value="">— none —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors?.project} />
            </div>
            <div className="field">
              <label>Reaction type</label>
              <input name="reaction_type" defaultValue={initial?.reaction_type ?? ""} placeholder="Wet–dry cycling / condensation" />
              <FieldError message={fieldErrors?.reaction_type} />
            </div>
          </div>
        </section>

        <section className="fsec glass">
          <h3>
            <span className="sec-num">02</span>Chemistry
          </h3>
          <p className="sec-sub">Compounds, metals and conditions.</p>
          <TagField name="compounds" label="Compounds" initial={initial?.compounds ?? []} suggestions={vocab?.compounds} />
          <FieldError message={fieldErrors?.compounds} />
          <TagField name="metals" label="Metals" metal initial={initial?.metals ?? []} suggestions={vocab?.metals} />
          <FieldError message={fieldErrors?.metals} />
          <div className="grid-3">
            <div className="field">
              <label>pH</label>
              <input name="ph" type="number" step="0.1" defaultValue={initial?.ph ?? ""} placeholder="7.0" />
              <FieldError message={fieldErrors?.ph} />
            </div>
            <div className="field">
              <label>Cycles</label>
              <input name="cycles" type="number" defaultValue={initial?.cycles ?? ""} placeholder="5" />
              <FieldError message={fieldErrors?.cycles} />
            </div>
            <div className="field">
              <label>Temperature</label>
              <input name="temperature" defaultValue={initial?.temperature ?? ""} placeholder="60 °C dry-down" />
              <FieldError message={fieldErrors?.temperature} />
            </div>
          </div>
          <div className="field">
            <label>Concentration</label>
            <input name="concentration" defaultValue={initial?.concentration ?? ""} placeholder="50 mM each monomer, 5 mM ZnCl₂" />
            <FieldError message={fieldErrors?.concentration} />
          </div>
        </section>

        <section className="fsec glass">
          <h3>
            <span className="sec-num">03</span>Analysis
          </h3>
          <p className="sec-sub">Methods used and notable m/z peaks.</p>
          <div className="field">
            <label>Methods</label>
            <div className="method-grid">
              {METHOD_OPTIONS.map((m) => (
                <label key={m} className={`method-opt${methods.includes(m) ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    name={`method:${m}`}
                    checked={methods.includes(m)}
                    onChange={() => toggleMethod(m)}
                    style={{ display: "none" }}
                  />
                  <span className="box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="12" height="12">
                      <path d="M5 12l4 4 10-10" />
                    </svg>
                  </span>
                  {m}
                </label>
              ))}
            </div>
            <FieldError message={fieldErrors?.methods} />
          </div>
          <div className="field">
            <label>m/z peaks (comma-separated)</label>
            <input name="mz" defaultValue={initial?.mz?.join(", ") ?? ""} placeholder="297, 595" />
            <FieldError message={fieldErrors?.mz} />
          </div>
        </section>

        <section className="fsec glass">
          <h3>
            <span className="sec-num">04</span>Observations
          </h3>
          <p className="sec-sub">What you saw. This is what semantic search reads later.</p>
          <div className="field">
            <label>Observations</label>
            <textarea name="observations" rows={4} defaultValue={initial?.observations ?? ""} placeholder="Yellowing after the first dry-down; precipitate on rehydration…" />
            <FieldError message={fieldErrors?.observations} />
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} placeholder="Anything else worth recording." />
            <FieldError message={fieldErrors?.notes} />
          </div>
        </section>
      </div>

      <aside className="form-aside">
        <div className="summary-card glass">
          <h4>Ready to save?</h4>
          {state && !state.ok && (
            <p className="field-error" role="alert" style={{ marginBottom: 10 }}>
              {state.error}
            </p>
          )}
          <p className="sec-sub" style={{ margin: "0 0 14px" }}>
            The record is typed and searchable immediately. You can edit it later.
          </p>
          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            {submitLabel}
          </button>
        </div>
      </aside>
    </form>
  );
}
