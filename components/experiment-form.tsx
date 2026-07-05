"use client";

import { useState } from "react";
import { METHOD_OPTIONS, type Experiment, type Project } from "@/lib/types";

type Props = {
  projects: Project[];
  action: (formData: FormData) => void | Promise<void>;
  initial?: Experiment;
  submitLabel: string;
};

function TagField({
  name,
  label,
  metal,
  initial,
}: {
  name: string;
  label: string;
  metal?: boolean;
  initial: string[];
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setDraft("");
  }

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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && tags.length) {
              setTags(tags.slice(0, -1));
            }
          }}
          onBlur={add}
          placeholder="type and press Enter"
        />
      </div>
    </div>
  );
}

export function ExperimentForm({ projects, action, initial, submitLabel }: Props) {
  const [methods, setMethods] = useState<string[]>(initial?.methods ?? []);

  function toggleMethod(m: string) {
    setMethods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  return (
    <form action={action} className="form-shell">
      <div className="form-sections">
        <section className="fsec glass">
          <h3>
            <span className="sec-num">01</span>Identity
          </h3>
          <p className="sec-sub">What the experiment is and who ran it.</p>
          <div className="field">
            <label>Name *</label>
            <input name="name" required defaultValue={initial?.name ?? ""} placeholder="His + TGA + Zn — wet–dry cycling" />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Date</label>
              <input type="date" name="date" defaultValue={initial?.date ?? ""} />
            </div>
            <div className="field">
              <label>Researcher</label>
              <input name="researcher" defaultValue={initial?.researcher ?? ""} placeholder="Y. Ezerzer" />
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
            </div>
            <div className="field">
              <label>Reaction type</label>
              <input name="reaction_type" defaultValue={initial?.reaction_type ?? ""} placeholder="Wet–dry cycling / condensation" />
            </div>
          </div>
        </section>

        <section className="fsec glass">
          <h3>
            <span className="sec-num">02</span>Chemistry
          </h3>
          <p className="sec-sub">Compounds, metals and conditions.</p>
          <TagField name="compounds" label="Compounds" initial={initial?.compounds ?? []} />
          <TagField name="metals" label="Metals" metal initial={initial?.metals ?? []} />
          <div className="grid-3">
            <div className="field">
              <label>pH</label>
              <input name="ph" type="number" step="0.1" defaultValue={initial?.ph ?? ""} placeholder="7.0" />
            </div>
            <div className="field">
              <label>Cycles</label>
              <input name="cycles" type="number" defaultValue={initial?.cycles ?? ""} placeholder="5" />
            </div>
            <div className="field">
              <label>Temperature</label>
              <input name="temperature" defaultValue={initial?.temperature ?? ""} placeholder="60 °C dry-down" />
            </div>
          </div>
          <div className="field">
            <label>Concentration</label>
            <input name="concentration" defaultValue={initial?.concentration ?? ""} placeholder="50 mM each monomer, 5 mM ZnCl₂" />
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
          </div>
          <div className="field">
            <label>m/z peaks (comma-separated)</label>
            <input name="mz" defaultValue={initial?.mz?.join(", ") ?? ""} placeholder="297, 595" />
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
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} placeholder="Anything else worth recording." />
          </div>
        </section>
      </div>

      <aside className="form-aside">
        <div className="summary-card glass">
          <h4>Ready to save?</h4>
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
