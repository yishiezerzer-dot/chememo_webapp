import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExperiment, listVocab, listSampleVocab } from "@/lib/experiments/service";
import { listProjects } from "@/lib/projects/service";
import { getDraft } from "@/lib/drafts/service";
import { updateExperiment } from "@/app/(app)/new/actions";
import { reopenExperiment } from "../lifecycle-actions";
import { ExperimentForm } from "@/components/experiment-form";
import { StatusBadge } from "@/components/status-badge";
import { ReopenExperimentButton } from "@/components/reopen-experiment-button";

export default async function EditExperimentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draftKey = { targetExperimentId: id } as const;
  const [result, projects, vocab, sampleVocab, recoveredDraft] = await Promise.all([
    getExperiment(id),
    listProjects(),
    listVocab(),
    listSampleVocab(),
    getDraft(draftKey),
  ]);
  if (!result) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Only the owner may edit; others are bounced back to the record.
  if (!user || user.id !== result.experiment.owner_id) {
    redirect(`/experiments/${id}`);
  }

  const { experiment } = result;

  // T1.1/D4 — a locked record's scientific fields are DB-enforced immutable;
  // don't even render the form. Reopening (§18.5) is the only way back in.
  if (experiment.locked_at) {
    return (
      <div>
        <span className="eyebrow">Edit · {id}</span>
        <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 12px" }}>
          {experiment.name}
        </h2>
        <div style={{ marginBottom: 16 }}>
          <StatusBadge status={experiment.status} />
        </div>
        <p className="muted" style={{ maxWidth: 560 }}>
          This experiment is locked (standard §18.5) — its scientific fields cannot be edited.
          Reopen it with a documented reason to make changes, or{" "}
          <Link href={`/experiments/${id}`}>view the full record</Link>.
        </p>
        <ReopenExperimentButton action={reopenExperiment.bind(null, id)} />
      </div>
    );
  }

  return (
    <div>
      <span className="eyebrow">Edit · {id}</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        Edit experiment
      </h2>
      <ExperimentForm
        projects={projects}
        action={updateExperiment.bind(null, id)}
        initial={experiment}
        submitLabel="Save changes"
        vocab={vocab}
        sampleVocab={sampleVocab}
        draftKey={draftKey}
        recoveredDraft={recoveredDraft}
      />
    </div>
  );
}
