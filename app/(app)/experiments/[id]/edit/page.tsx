import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExperiment, listProjects, listVocab } from "@/lib/experiments";
import { updateExperiment } from "@/app/(app)/new/actions";
import { ExperimentForm } from "@/components/experiment-form";

export default async function EditExperimentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, projects, vocab] = await Promise.all([
    getExperiment(id),
    listProjects(),
    listVocab(),
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

  return (
    <div>
      <span className="eyebrow">Edit · {id}</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        Edit experiment
      </h2>
      <ExperimentForm
        projects={projects}
        action={updateExperiment.bind(null, id)}
        initial={result.experiment}
        submitLabel="Save changes"
        vocab={vocab}
      />
    </div>
  );
}
