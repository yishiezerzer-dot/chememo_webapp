import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { ExperimentStep, ProtocolStep, StepObservation, StepDeviation, Quantity } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type StepDetail = {
  step: ExperimentStep;
  protocolStep: ProtocolStep;
  observations: StepObservation[];
  deviations: StepDeviation[];
};

// T1.5 D5 — one row per protocol_steps row for this experiment's linked
// version, idempotent via ON CONFLICT DO NOTHING so re-clicking "Instantiate
// steps" (e.g. after a page refresh) never duplicates rows.
export async function instantiateSteps(
  supabase: Supabase,
  experimentId: string,
  protocolVersionId: string
): Promise<void> {
  const { data: steps, error: stepsError } = await supabase
    .from("protocol_steps")
    .select("id")
    .eq("protocol_version_id", protocolVersionId);
  if (stepsError) throw new AppError("conflict", "Could not read the protocol's steps.", { cause: stepsError });
  if (!steps || steps.length === 0) return;

  const { error } = await supabase
    .from("experiment_steps")
    .upsert(
      steps.map((s) => ({ experiment_id: experimentId, protocol_step_id: s.id })),
      { onConflict: "experiment_id,protocol_step_id", ignoreDuplicates: true }
    );
  if (error) throw new AppError("conflict", "Could not instantiate the protocol's steps.", { cause: error });
}

// Joined view the step-runner UI renders: each instantiated step alongside
// its (frozen, immutable) protocol_step definition and its append-only logs.
export async function listStepDetails(experimentId: string): Promise<StepDetail[]> {
  const supabase = await createClient();
  const { data: steps, error } = await supabase
    .from("experiment_steps")
    .select("*, protocol_steps(*)")
    .eq("experiment_id", experimentId);
  if (error) throw error;
  if (!steps || steps.length === 0) return [];

  const stepIds = steps.map((s) => s.id as string);
  const [{ data: observations }, { data: deviations }] = await Promise.all([
    supabase.from("step_observations").select("*").in("experiment_step_id", stepIds).order("observed_at"),
    supabase.from("step_deviations").select("*").in("experiment_step_id", stepIds).order("reported_at"),
  ]);

  const byStep = steps
    .map((row) => {
      const { protocol_steps, ...step } = row as unknown as ExperimentStep & { protocol_steps: ProtocolStep };
      return {
        step: step as ExperimentStep,
        protocolStep: protocol_steps,
        observations: (observations ?? []).filter((o) => o.experiment_step_id === row.id) as StepObservation[],
        deviations: (deviations ?? []).filter((d) => d.experiment_step_id === row.id) as StepDeviation[],
      };
    })
    .sort((a, b) => a.protocolStep.step_number - b.protocolStep.step_number);

  return byStep;
}

export async function updateStepStatus(
  supabase: Supabase,
  stepId: string,
  status: string,
  userId: string,
  actual: { ph: number | null; quantities: Record<string, Quantity>; atmosphere: string | null }
): Promise<void> {
  const patch: {
    status: string;
    actual_ph: number | null;
    actual_quantities: Record<string, Quantity>;
    actual_atmosphere: string | null;
    started_at?: string;
    completed_at?: string;
    completed_by?: string;
  } = {
    status,
    actual_ph: actual.ph,
    actual_quantities: actual.quantities,
    actual_atmosphere: actual.atmosphere,
  };
  if (status === "in_progress") patch.started_at = new Date().toISOString();
  if (status === "completed") {
    patch.completed_at = new Date().toISOString();
    patch.completed_by = userId;
  }
  const { error } = await supabase.from("experiment_steps").update(patch).eq("id", stepId);
  if (error) throw new AppError("conflict", "Could not update the step.", { cause: error });
}

// Returns the row it wrote. StepRunner renders the observation immediately
// (see useStickyState), and its rule is that the patch comes from the server's
// own row — observed_at in particular is the database's now(), not the
// workstation's clock, and observed_by is a real id rather than a guessed null.
export async function recordObservation(
  supabase: Supabase,
  stepId: string,
  userId: string,
  note: string
): Promise<StepObservation> {
  const { data, error } = await supabase
    .from("step_observations")
    .insert({ experiment_step_id: stepId, observed_by: userId, note })
    .select("*")
    .single();
  if (error) throw new AppError("conflict", "Could not save the observation.", { cause: error });
  return data as StepObservation;
}

export type DeviationInput = {
  category: string;
  what_happened: string;
  how_discovered: string | null;
  likely_impact: string | null;
  sample_still_usable: boolean | null;
  corrective_action: string | null;
  preventive_action: string | null;
  affected_samples: string | null;
};

// Same reason as recordObservation: the row comes back so the panel renders
// what was actually written, reported_at and reported_by included.
export async function recordDeviation(
  supabase: Supabase,
  stepId: string,
  userId: string,
  input: DeviationInput
): Promise<StepDeviation> {
  const { data, error } = await supabase
    .from("step_deviations")
    .insert({ experiment_step_id: stepId, reported_by: userId, decision_owner: userId, ...input })
    .select("*")
    .single();
  if (error) throw new AppError("conflict", "Could not save the deviation.", { cause: error });
  return data as StepDeviation;
}
