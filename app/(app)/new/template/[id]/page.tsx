import Link from "next/link";
import { notFound } from "next/navigation";
import { listProjects } from "@/lib/projects/service";
import { listVocab, listSampleVocab } from "@/lib/experiments/service";
import { listVersions, getLatestVersion } from "@/lib/templates/service";
import { isLlmEnabled } from "@/lib/llm";
import { getDraft } from "@/lib/drafts/service";
import { NewExperimentClient } from "@/components/new-experiment-client";
import { createExperiment, extractFromNotes } from "../../actions";
import type { Experiment } from "@/lib/types";

export default async function InstantiateTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;

  const [versions, projects, vocab, sampleVocab] = await Promise.all([
    listVersions(id),
    listProjects(),
    listVocab(),
    listSampleVocab(),
  ]);
  const version = (v ? versions.find((x) => x.id === v) : null) ?? (await getLatestVersion(id));
  if (!version) notFound();

  const draftKey = { clientDraftId: `new:template:${version.id}` } as const;
  const recoveredDraft = await getDraft(draftKey);

  return (
    <div>
      <span className="eyebrow">New experiment · Template</span>
      {versions.length > 1 && (
        <p className="sec-sub" style={{ margin: "4px 0 16px" }}>
          Version:{" "}
          {versions.map((ver, i) => (
            <span key={ver.id}>
              {i > 0 && " · "}
              {ver.id === version.id ? (
                <strong>v{ver.version}</strong>
              ) : (
                <Link href={`/new/template/${id}?v=${ver.id}`}>v{ver.version}</Link>
              )}
            </span>
          ))}
        </p>
      )}
      <NewExperimentClient
        projects={projects}
        aiEnabled={isLlmEnabled()}
        createAction={createExperiment}
        extractAction={extractFromNotes}
        vocab={vocab}
        sampleVocab={sampleVocab}
        initialFields={version.defaults as Partial<Experiment>}
        templateVersionId={version.id}
        draftKey={draftKey}
        recoveredDraft={recoveredDraft}
      />
    </div>
  );
}
