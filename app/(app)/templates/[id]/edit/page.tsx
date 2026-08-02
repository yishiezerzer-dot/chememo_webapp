import { notFound } from "next/navigation";
import { listTemplates, getLatestVersion } from "@/lib/templates/service";
import { listProjects } from "@/lib/projects/service";
import { listVocab, listSampleVocab } from "@/lib/experiments/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { getDraft } from "@/lib/drafts/service";
import { ExperimentForm } from "@/components/experiment-form";
import { saveTemplateVersion } from "../../actions";
import type { Experiment } from "@/lib/types";

const FORM_ID = "template-defaults-form";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draftKey = { clientDraftId: `template-edit:${id}` } as const;
  const [templates, latest, projects, vocab, sampleVocab, quantityKinds, recoveredDraft] = await Promise.all([
    listTemplates(true),
    getLatestVersion(id),
    listProjects(),
    listVocab(),
    listSampleVocab(),
    listQuantityKinds(),
    getDraft(draftKey),
  ]);
  const template = templates.find((t) => t.id === id);
  if (!template) notFound();

  return (
    <div>
      <span className="eyebrow">Templates</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 4px" }}>
        {template.name}
      </h2>
      {latest && (
        <p className="sec-sub" style={{ margin: "0 0 20px" }}>
          Editing v{latest.version}
          {latest.frozen_at
            ? " — in use by at least one experiment, so saving now creates a new version."
            : " (not yet used by any experiment — edits save in place)."}
        </p>
      )}
      <div className="field" style={{ maxWidth: 480, marginBottom: 20 }}>
        <label>Required fields (comma-separated field names)</label>
        <input
          form={FORM_ID}
          name="required_fields"
          defaultValue={(latest?.required_fields ?? []).join(", ")}
          placeholder="scientific_question, hypothesis, sample_matrix"
        />
        <p className="sec-sub" style={{ margin: "6px 0 0" }}>
          Field names match the experiment form&apos;s own fields (e.g. <code>scientific_question</code>,{" "}
          <code>sample_matrix</code>, <code>reaction_type</code>). Left blank in the created experiment,
          these block saving until filled.
        </p>
      </div>
      <ExperimentForm
        formId={FORM_ID}
        nameRequired={false}
        projects={projects}
        action={saveTemplateVersion.bind(null, id)}
        initial={(latest?.defaults ?? {}) as Partial<Experiment>}
        submitLabel="Save template version"
        vocab={vocab}
        sampleVocab={sampleVocab}
        quantityKinds={quantityKinds}
        draftKey={draftKey}
        recoveredDraft={recoveredDraft}
      />
    </div>
  );
}
