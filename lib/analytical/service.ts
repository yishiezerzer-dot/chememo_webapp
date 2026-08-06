import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { Json } from "@/lib/database.types";
import type {
  Instrument,
  InstrumentMethod,
  MethodType,
  AnalysisRun,
  AnalysisFile,
  AnalysisFileRole,
  AnalysisResult,
  PeakAssignment,
  IonMode,
} from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// instruments (D1)
// ---------------------------------------------------------------------------

export async function listInstruments(): Promise<Instrument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("instruments").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Instrument[];
}

export async function createInstrument(
  supabase: Supabase,
  userId: string,
  workspaceId: string,
  name: string,
  model: string | null,
  serialNumber: string | null,
  location: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from("instruments")
    .insert({ name, model: model, serial_number: serialNumber, location, created_by: userId, workspace_id: workspaceId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the instrument.", { cause: error });
  return data.id as string;
}

// ---------------------------------------------------------------------------
// instrument_methods (D2)
// ---------------------------------------------------------------------------

export async function listMethods(instrumentId: string): Promise<InstrumentMethod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("instrument_methods").select("*").eq("instrument_id", instrumentId).order("name");
  if (error) throw error;
  return (data ?? []) as InstrumentMethod[];
}

export async function listAllMethodOptions(): Promise<{ id: string; label: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instrument_methods")
    .select("id, name, method_type, instruments!inner(name)");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const instrument = Array.isArray(row.instruments) ? row.instruments[0] : row.instruments;
    return { id: row.id as string, label: `${instrument?.name ?? "Instrument"} — ${row.name} (${row.method_type})` };
  });
}

export async function createMethod(
  supabase: Supabase,
  instrumentId: string,
  name: string,
  methodType: MethodType,
  parameters: Record<string, unknown>
): Promise<string> {
  const { data, error } = await supabase
    .from("instrument_methods")
    .insert({ instrument_id: instrumentId, name, method_type: methodType, parameters: parameters as Json })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the method.", { cause: error });
  return data.id as string;
}

// ---------------------------------------------------------------------------
// analysis_runs (D3)
// ---------------------------------------------------------------------------

export async function listRuns(sampleId: string): Promise<AnalysisRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("analysis_runs").select("*").eq("sample_id", sampleId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AnalysisRun[];
}

export async function createRun(
  supabase: Supabase,
  userId: string,
  sampleId: string,
  instrumentMethodId: string,
  status: string,
  operator: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from("analysis_runs")
    .insert({ sample_id: sampleId, instrument_method_id: instrumentMethodId, status, operator, created_by: userId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the analysis run.", { cause: error });
  return data.id as string;
}

// ---------------------------------------------------------------------------
// analysis_files (D4)
// ---------------------------------------------------------------------------

export async function listFiles(analysisRunId: string): Promise<AnalysisFile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("analysis_files").select("*").eq("analysis_run_id", analysisRunId).order("created_at");
  if (error) throw error;
  return (data ?? []) as AnalysisFile[];
}

export async function addFile(
  supabase: Supabase,
  userId: string,
  analysisRunId: string,
  fileRole: AnalysisFileRole,
  filename: string | null,
  url: string | null
): Promise<void> {
  const { error } = await supabase
    .from("analysis_files")
    .insert({ analysis_run_id: analysisRunId, file_role: fileRole, filename, url, uploaded_by: userId });
  if (error) throw new AppError("conflict", "Could not add the file reference.", { cause: error });
}

// ---------------------------------------------------------------------------
// analysis_results (D5)
// ---------------------------------------------------------------------------

export async function listResults(analysisRunId: string): Promise<AnalysisResult[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("analysis_results").select("*").eq("analysis_run_id", analysisRunId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AnalysisResult[];
}

export async function createResult(
  supabase: Supabase,
  userId: string,
  analysisRunId: string,
  resultConfidence: string | null,
  summary: string | null,
  details: Record<string, unknown>
): Promise<string> {
  const { data, error } = await supabase
    .from("analysis_results")
    .insert({ analysis_run_id: analysisRunId, result_confidence: resultConfidence, summary, details: details as Json, interpreted_by: userId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the analysis result.", { cause: error });
  return data.id as string;
}

// ---------------------------------------------------------------------------
// peak_assignments (D6)
// ---------------------------------------------------------------------------

export async function listPeaks(analysisResultId: string): Promise<PeakAssignment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("peak_assignments").select("*").eq("analysis_result_id", analysisResultId).order("retention_time_min");
  if (error) throw error;
  return (data ?? []) as PeakAssignment[];
}

export type PeakFields = {
  expected_mz: number | null;
  observed_mz: number | null;
  ion_mode: IonMode | null;
  adduct: string | null;
  charge: number | null;
  ppm_error: number | null;
  retention_time_min: number | null;
  ms_level: number | null;
  intensity: number | null;
  formula_candidate: string | null;
  assignment: string | null;
  confidence: string | null;
  notes: string | null;
};

export async function addPeak(supabase: Supabase, analysisResultId: string, fields: PeakFields): Promise<void> {
  const { error } = await supabase.from("peak_assignments").insert({ ...fields, analysis_result_id: analysisResultId });
  if (error) throw new AppError("conflict", "Could not add the peak assignment.", { cause: error });
}
