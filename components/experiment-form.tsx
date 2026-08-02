"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import {
  METHOD_OPTIONS,
  type ActionResult,
  type DraftKey,
  type Experiment,
  type ExperimentDraft,
  type ExperimentInput,
  type Project,
  type QuantityKind,
} from "@/lib/types";
import { SampleMatrixEditor } from "@/components/sample-matrix-editor";
import { ControlsChecklist } from "@/components/controls-checklist";
import { QuantitiesEditor } from "@/components/quantities-editor";
import { useAutosave, readLocalDraft, type AutosaveState } from "@/lib/use-autosave";
import { discardDraftAction } from "@/app/(app)/drafts-actions";

type Props = {
  projects: Project[];
  action: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  // Partial so LLM-extracted fields (Phase 9), template defaults, and clone
  // selections (T1.2) can all pre-fill the form the same way.
  initial?: Partial<Experiment>;
  submitLabel: string;
  // Distinct compound/metal values for autocomplete (optional).
  vocab?: { compounds: string[]; metals: string[] };
  // controlled_vocabularies rows for the sample-matrix editor (T1.2 D2).
  sampleVocab?: { sampleTypes: string[]; reactionModes: string[]; sampleStatuses: string[] };
  // quantity_kinds registry rows for QuantitiesEditor (T1.4 D2).
  quantityKinds?: QuantityKind[];
  // Provenance stamps (T1.2 D6) — set by the instantiate/clone pages, never
  // user-editable, carried through as hidden fields to createExperiment.
  templateVersionId?: string | null;
  basedOnExperimentId?: string | null;
  // Lets an input rendered outside this component (e.g. the templates
  // editor's "required fields" input) associate via the HTML `form`
  // attribute and still land in this form's submitted FormData.
  formId?: string;
  // A template's defaults have no fixed experiment name to require (T1.2) —
  // the templates editor sets this false. Defaults true for every other caller.
  nameRequired?: boolean;
  // T1.3 — every caller supplies a draft key (D2): the experiment's own id
  // when editing, a deterministic route-derived string everywhere else.
  draftKey: DraftKey;
  // The server-side draft for this key, fetched by the page alongside its
  // other data (cross-device recovery backstop, D3).
  recoveredDraft?: ExperimentDraft | null;
  // PasteNotes' current text (a sibling component, not a descendant of this
  // <form> — T1.3 D7). Only ever set on the new-experiment entry points.
  rawNote?: string;
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

// HTML <input type="datetime-local"> only accepts "YYYY-MM-DDTHH:mm" (no
// seconds, no offset); the first 16 characters of any ISO timestamptz string
// are always exactly that, so a slice is all the conversion this needs.
function toDatetimeLocal(v?: string | null): string {
  return v ? v.slice(0, 16) : "";
}

const SAVE_STATE_LABEL: Record<AutosaveState, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline — will retry",
  conflict: "Someone else changed this — reload to see the latest version",
};

// T1.3 — outer wrapper. Owns the "recover an unsaved draft?" banner and the
// restore mechanism: TagField/SampleMatrixEditor/ControlsChecklist and the
// `methods` checkboxes all seed their own state once at mount, so a restore
// has to remount the entire form body (ExperimentFormBody, keyed below), not
// just patch the `initial` prop — patching alone wouldn't reach any of them.
export function ExperimentForm(props: Props) {
  const { draftKey, recoveredDraft, initial } = props;
  const [restoreKey, setRestoreKey] = useState(0);
  const [restoredFields, setRestoredFields] = useState<Partial<ExperimentInput> | null>(null);
  const [banner, setBanner] = useState<{ fields: Partial<ExperimentInput>; rawNote: string | null; savedAt: string } | null>(
    null
  );

  // Fresh check per mount only (a new page load / crash recovery moment),
  // not on every keystroke. Offers whichever draft is newer: the synchronous
  // localStorage mirror (same device, no debounce lag) or the server draft.
  // localStorage is a genuine external system unavailable during SSR (hence
  // an effect, not a lazy useState initializer — that would mismatch between
  // the server and client's first render); this is precisely the "subscribe
  // to an external system, setState when it changes" case the lint rule's
  // own docs carve out, not a render-derivable value being pushed to state.
  useEffect(() => {
    const local = readLocalDraft(draftKey);
    const localTime = local?.savedAt ?? 0;
    const serverTime = recoveredDraft ? new Date(recoveredDraft.updated_at).getTime() : 0;
    if (local && Object.keys(local.fields).length > 0 && localTime >= serverTime) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBanner({ fields: local.fields as Partial<ExperimentInput>, rawNote: local.rawNote, savedAt: new Date(localTime).toISOString() });
    } else if (recoveredDraft && Object.keys(recoveredDraft.fields).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBanner({ fields: recoveredDraft.fields, rawNote: recoveredDraft.raw_note, savedAt: recoveredDraft.updated_at });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function restore() {
    if (!banner) return;
    const fields = { ...banner.fields };
    // D7 (scoped) — a recovered raw note that hasn't otherwise been claimed
    // rides into Notes, since PasteNotes is a sibling component this form
    // doesn't control and can't repopulate directly.
    if (banner.rawNote && !fields.notes) {
      fields.notes = `[Recovered pasted note]\n${banner.rawNote}`;
    }
    setRestoredFields(fields);
    setBanner(null);
    setRestoreKey((k) => k + 1);
    // The stale draft's job is done once its content is back in the visible
    // form — otherwise a reload before the next autosave tick would re-offer
    // this same banner even though the user already restored it.
    void discardDraftAction(draftKey);
  }

  function discardBanner() {
    setBanner(null);
    void discardDraftAction(draftKey);
  }

  const effectiveInitial = restoredFields ? { ...initial, ...restoredFields } : initial;

  return (
    <>
      {banner && (
        <div className="obs-box glass" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <p style={{ margin: 0, flex: 1 }}>
            Recover an unsaved draft from {new Date(banner.savedAt).toLocaleString()}?
          </p>
          <button type="button" className="btn btn-sm" onClick={restore}>
            Restore
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={discardBanner}>
            Discard
          </button>
        </div>
      )}
      <ExperimentFormBody key={restoreKey} {...props} initial={effectiveInitial} />
    </>
  );
}

function ExperimentFormBody({
  projects,
  action,
  initial,
  submitLabel,
  vocab,
  sampleVocab,
  quantityKinds,
  templateVersionId,
  basedOnExperimentId,
  formId,
  nameRequired = true,
  draftKey,
  rawNote,
}: Props) {
  const [methods, setMethods] = useState<string[]>(initial?.methods ?? []);
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const criteriaLocked = !!initial?.acceptance_criteria_locked_at;
  const formRef = useRef<HTMLFormElement>(null);
  const rawNoteRef = useRef(rawNote);
  useEffect(() => {
    rawNoteRef.current = rawNote;
  }, [rawNote]);

  const { state: saveState, markConflict, markSaved } = useAutosave({
    formRef,
    draftKey,
    getRawNote: () => rawNoteRef.current ?? null,
  });

  function toggleMethod(m: string) {
    setMethods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  // Deliberately not a plain <form action={fn}>: React resets uncontrolled
  // fields after any action call (including a validation failure), which
  // would wipe what the user just typed. Calling the action from onSubmit
  // keeps the DOM inputs untouched when the result comes back ok: false.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(state, formData);
      setState(result);
      if (result.ok) markSaved();
      else if (result.conflict) markConflict();
    });
  }

  return (
    <form ref={formRef} id={formId} onSubmit={handleSubmit} className="form-shell">
      {templateVersionId && <input type="hidden" name="template_version_id" value={templateVersionId} />}
      {basedOnExperimentId && <input type="hidden" name="based_on_experiment_id" value={basedOnExperimentId} />}
      <input type="hidden" name="base_updated_at" value={initial?.updated_at ?? ""} />
      {/* T1.3 — lets createExperiment discard the matching draft on success;
          only meaningful on the new-experiment entry points (D2). */}
      {"clientDraftId" in draftKey && (
        <input type="hidden" name="draft_client_id" value={draftKey.clientDraftId} />
      )}
      <div className="form-sections">
        <details className="fsec glass" open>
          <summary>
            <h3 style={{ display: "inline-flex" }}>
              <span className="sec-num">01</span>Planning
            </h3>
          </summary>
          <p className="sec-sub">
            The §8.1 pre-registration — write this before the bench work starts.
          </p>
          <div className="field">
            <label>Scientific question</label>
            <textarea name="scientific_question" rows={2} defaultValue={initial?.scientific_question ?? ""} />
            <FieldError message={fieldErrors?.scientific_question} />
          </div>
          <div className="field">
            <label>Rationale</label>
            <textarea name="rationale" rows={2} defaultValue={initial?.rationale ?? ""} />
            <FieldError message={fieldErrors?.rationale} />
          </div>
          <div className="field">
            <label>Hypothesis</label>
            <textarea name="hypothesis" rows={2} defaultValue={initial?.hypothesis ?? ""} />
            <FieldError message={fieldErrors?.hypothesis} />
          </div>
          <div className="field">
            <label>Primary outcome</label>
            <textarea name="primary_outcome" rows={2} defaultValue={initial?.primary_outcome ?? ""} />
            <FieldError message={fieldErrors?.primary_outcome} />
          </div>
          <div className="field">
            <label>Secondary outcomes</label>
            <textarea name="secondary_outcomes" rows={2} defaultValue={initial?.secondary_outcomes ?? ""} />
            <FieldError message={fieldErrors?.secondary_outcomes} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Independent variables</label>
              <textarea name="independent_variables" rows={2} defaultValue={initial?.independent_variables ?? ""} />
              <FieldError message={fieldErrors?.independent_variables} />
            </div>
            <div className="field">
              <label>Controlled variables</label>
              <textarea name="controlled_variables" rows={2} defaultValue={initial?.controlled_variables ?? ""} />
              <FieldError message={fieldErrors?.controlled_variables} />
            </div>
          </div>
          <div className="field">
            <label>Sample matrix</label>
            <SampleMatrixEditor
              name="sample_matrix"
              initial={initial?.sample_matrix ?? []}
              sampleTypes={sampleVocab?.sampleTypes ?? []}
              reactionModes={sampleVocab?.reactionModes ?? []}
              sampleStatuses={sampleVocab?.sampleStatuses ?? []}
            />
          </div>
          <div className="field">
            <label>Controls</label>
            <ControlsChecklist name="controls" initial={initial?.controls ?? []} />
          </div>
          <div className="field">
            <label>Protocol version</label>
            <input name="protocol_version" defaultValue={initial?.protocol_version ?? ""} placeholder="PROT-TBD-v1.0" />
            <FieldError message={fieldErrors?.protocol_version} />
          </div>
          <div className="field">
            <label>Planned analyses</label>
            <textarea name="planned_analyses" rows={2} defaultValue={initial?.planned_analyses ?? ""} />
            <FieldError message={fieldErrors?.planned_analyses} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Planned start</label>
              <input
                type="datetime-local"
                name="planned_start_at"
                defaultValue={toDatetimeLocal(initial?.planned_start_at)}
              />
              <FieldError message={fieldErrors?.planned_start_at} />
            </div>
            <div className="field">
              <label>Planned end</label>
              <input
                type="datetime-local"
                name="planned_end_at"
                defaultValue={toDatetimeLocal(initial?.planned_end_at)}
              />
              <FieldError message={fieldErrors?.planned_end_at} />
            </div>
          </div>
          <div className="field">
            <label>Data-analysis plan</label>
            <textarea name="data_analysis_plan" rows={2} defaultValue={initial?.data_analysis_plan ?? ""} />
            <FieldError message={fieldErrors?.data_analysis_plan} />
          </div>
          <div className="field">
            <label>Risks and likely failure modes</label>
            <textarea name="risks_failure_modes" rows={2} defaultValue={initial?.risks_failure_modes ?? ""} />
            <FieldError message={fieldErrors?.risks_failure_modes} />
          </div>
          <div className="field">
            <label>Sample-storage plan</label>
            <textarea name="sample_storage_plan" rows={2} defaultValue={initial?.sample_storage_plan ?? ""} />
            <FieldError message={fieldErrors?.sample_storage_plan} />
          </div>
          <div className="field">
            <label>Acceptance criteria</label>
            {criteriaLocked ? (
              <>
                <input type="hidden" name="acceptance_criteria" value={initial?.acceptance_criteria ?? ""} />
                <p className="obs-box glass" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ flexShrink: 0, marginTop: 2 }}>
                    <rect x="4" y="10" width="16" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                  {initial?.acceptance_criteria || "None recorded."}
                </p>
              </>
            ) : (
              <textarea name="acceptance_criteria" rows={2} defaultValue={initial?.acceptance_criteria ?? ""} placeholder="None — exploratory, no pre-specified criteria" />
            )}
            <p className="sec-sub" style={{ margin: "6px 0 0" }}>
              {criteriaLocked
                ? "Locked when the experiment started (standard §8.6) — cannot be edited, including after a reopen."
                : "Locks when the experiment starts and cannot be edited afterwards (standard §8.6)."}
            </p>
            <FieldError message={fieldErrors?.acceptance_criteria} />
          </div>
        </details>

        <section className="fsec glass">
          <h3>
            <span className="sec-num">02</span>Identity
          </h3>
          <p className="sec-sub">What the experiment is and who ran it.</p>
          <div className="field">
            <label>Name{nameRequired ? " *" : ""}</label>
            <input
              name="name"
              required={nameRequired}
              defaultValue={initial?.name ?? ""}
              placeholder="His + TGA + Zn — wet–dry cycling"
            />
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
            <span className="sec-num">03</span>Chemistry
          </h3>
          <p className="sec-sub">Compounds, metals and conditions.</p>
          <TagField name="compounds" label="Compounds" initial={initial?.compounds ?? []} suggestions={vocab?.compounds} />
          <FieldError message={fieldErrors?.compounds} />
          <TagField name="metals" label="Metals" metal initial={initial?.metals ?? []} suggestions={vocab?.metals} />
          <FieldError message={fieldErrors?.metals} />
          <div className="grid-2">
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
          </div>
          {/* T1.4 D4 — legacy free text stays exactly as recorded, display-only;
              never silently reinterpreted as a specific structured quantity. */}
          {(initial?.temperature || initial?.concentration) && (
            <p className="sec-sub" style={{ margin: "0 0 8px" }}>
              Recorded as free text (pre-T1.4): {[initial?.temperature, initial?.concentration].filter(Boolean).join(" · ")}
            </p>
          )}
          <QuantitiesEditor initial={initial?.quantities ?? {}} kinds={quantityKinds ?? []} />
        </section>

        <section className="fsec glass">
          <h3>
            <span className="sec-num">04</span>Analysis
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
            <span className="sec-num">05</span>Observations
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

        <section className="fsec glass">
          <h3>
            <span className="sec-num">06</span>Conclusions
          </h3>
          <p className="sec-sub">
            A conclusion is required before the experiment can be marked complete (standard §15.2).
          </p>
          <div className="field">
            <label>Conclusion</label>
            <textarea name="conclusion" rows={3} defaultValue={initial?.conclusion ?? ""} />
            <FieldError message={fieldErrors?.conclusion} />
          </div>
          <div className="field">
            <label>Next steps</label>
            <textarea name="next_steps" rows={2} defaultValue={initial?.next_steps ?? ""} />
            <FieldError message={fieldErrors?.next_steps} />
          </div>
        </section>
      </div>

      <aside className="form-aside">
        <div className="summary-card glass">
          <h4>Ready to save?</h4>
          {state && !state.ok ? (
            <p className="field-error" role="alert" style={{ marginBottom: 10 }}>
              {state.error}
              {state.conflict && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ display: "inline-flex", marginLeft: 6 }}
                    onClick={() => window.location.reload()}
                  >
                    Reload
                  </button>
                </>
              )}
            </p>
          ) : (
            saveState !== "idle" && (
              <p className="sec-sub" style={{ margin: "0 0 8px" }}>
                {SAVE_STATE_LABEL[saveState]}
              </p>
            )
          )}
          <p className="sec-sub" style={{ margin: "0 0 14px" }}>
            The record is typed and searchable immediately. You can edit it later.
          </p>
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
          >
            {pending ? "Saving…" : submitLabel}
          </button>
        </div>
      </aside>
    </form>
  );
}
