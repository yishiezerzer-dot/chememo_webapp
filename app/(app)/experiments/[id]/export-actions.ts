"use server";

import { requireUser } from "@/lib/authorization/policies";
import { getExperiment } from "@/lib/experiments/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { listProjects } from "@/lib/projects/service";
import { listVersionOptions } from "@/lib/protocols/service";
import { listRelationships } from "@/lib/relationships/service";
import { listTasks } from "@/lib/tasks/service";
import { listStepDetails } from "@/lib/experiment-steps/service";
import { listTimeline } from "@/lib/experiments/timeline";
import { buildExperimentMarkdown } from "@/lib/export/markdown";
import { AppError } from "@/lib/errors";

// T1.11 D7 — same "server action returns a string, client Blob-downloads it"
// pattern T1.6's CSV export already established, not a new authenticated route.
export async function exportExperimentMarkdownAction(experimentId: string): Promise<string> {
  const { supabase } = await requireUser();
  const result = await getExperiment(experimentId);
  if (!result) throw new AppError("not-found", "Experiment not found.");
  const { experiment, files } = result;

  const [projects, quantityKinds, protocolVersions, relationships, tasks, timeline, ownerProfile] = await Promise.all([
    listProjects(),
    listQuantityKinds(),
    listVersionOptions(),
    listRelationships(experimentId),
    listTasks("experiment", experimentId),
    listTimeline(experimentId, experiment, files),
    experiment.owner_id
      ? supabase.from("profiles").select("full_name, initials").eq("id", experiment.owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const stepDetails = experiment.protocol_version_id ? await listStepDetails(experimentId) : [];

  return buildExperimentMarkdown({
    experiment,
    projectLabel: projects.find((p) => p.id === experiment.project)?.label ?? null,
    ownerName: ownerProfile.data?.full_name || ownerProfile.data?.initials || null,
    protocolVersionLabel: protocolVersions.find((v) => v.id === experiment.protocol_version_id)?.label ?? null,
    quantityKinds,
    relationships,
    tasks,
    stepDetails,
    revisions: timeline,
  });
}
