import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getExperiment,
  getExperimentSummary,
  listRevisions,
  signedUrlsFor,
} from "@/lib/experiments/service";
import { listProjects } from "@/lib/projects/service";
import { softDeleteExperiment } from "@/app/(app)/new/actions";
import { uploadFile, addFileLink, removeFile } from "./file-actions";
import { generateSummary } from "./summary-actions";
import { isLlmEnabled } from "@/lib/llm";
import { DeleteExperimentButton } from "@/components/delete-experiment-button";
import { FileList } from "@/components/file-list";
import { FileManager } from "@/components/file-manager";
import { SummaryCard } from "@/components/summary-card";
import { HistoryPanel } from "@/components/history-panel";

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, projects, summary, revisions] = await Promise.all([
    getExperiment(id),
    listProjects(),
    getExperimentSummary(id),
    listRevisions(id),
  ]);
  if (!result) notFound();
  const aiEnabled = isLlmEnabled();
  const { experiment: e, files } = result;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = !!user && user.id === e.owner_id;

  const projectLabel = projects.find((p) => p.id === e.project)?.label ?? e.project;

  // Uploads live in a private bucket → resolve short-lived signed URLs; links
  // carry their own external URL. Both become the clickable `href`.
  const uploadPaths = files
    .filter((f) => f.kind === "upload" && f.storage_path)
    .map((f) => f.storage_path as string);
  const signed = await signedUrlsFor(uploadPaths);
  const fileItems = files.map((f) => ({
    ...f,
    href: f.kind === "link" ? f.url : f.storage_path ? signed[f.storage_path] ?? null : null,
  }));

  const specs: { k: string; v: string; big?: boolean }[] = [
    { k: "pH", v: e.ph !== null ? String(e.ph) : "—", big: true },
    { k: "Cycles", v: e.cycles !== null ? String(e.cycles) : "—", big: true },
    { k: "Date", v: e.date ?? "—" },
    { k: "Researcher", v: e.researcher ?? "—" },
    { k: "Temperature", v: e.temperature ?? "—" },
    { k: "Concentration", v: e.concentration ?? "—" },
  ];

  return (
    <div>
      <Link href="/experiments" className="muted" style={{ fontSize: 13 }}>
        ← All experiments
      </Link>

      <div className="detail-head" style={{ marginTop: 12 }}>
        <div>
          <div className="id">{e.id}</div>
          <h2>{e.name}</h2>
          <div className="detail-meta">
            {projectLabel && <span className="chip">{projectLabel}</span>}
            {e.reaction_type && <span className="chip">{e.reaction_type}</span>}
            {e.metals.map((m) => (
              <span key={m} className="chip">
                {m}
              </span>
            ))}
          </div>
        </div>
        {isOwner && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Link href={`/experiments/${e.id}/edit`} className="btn btn-ghost btn-sm">
              Edit
            </Link>
            <DeleteExperimentButton action={softDeleteExperiment.bind(null, e.id)} />
          </div>
        )}
      </div>

      <div className="detail-grid">
        <div>
          <div className="spec-grid">
            {specs.map((s) => (
              <div key={s.k} className="spec">
                <div className="k">{s.k}</div>
                <div className={`v${s.big ? " big" : ""}`}>{s.v}</div>
              </div>
            ))}
          </div>

          {e.compounds.length > 0 && (
            <div className="obs-box glass">
              <h4>Compounds</h4>
              <div className="detail-meta">
                {e.compounds.map((c) => (
                  <span key={c} className="chip">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {e.mz.length > 0 && (
            <div className="obs-box glass">
              <h4>m/z peaks</h4>
              <div className="mz-list">
                {e.mz.map((m) => (
                  <span key={m} className="mz">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="obs-box glass">
            <h4>Observations</h4>
            <p>{e.observations || "No observations recorded."}</p>
            {e.notes && (
              <>
                <h4 style={{ marginTop: 16 }}>Notes</h4>
                <p>{e.notes}</p>
              </>
            )}
          </div>
        </div>

        <aside className="detail-aside">
          <div className="panel glass">
            <h4 style={{ fontFamily: "var(--display)", margin: "0 0 12px" }}>
              Files{fileItems.length > 0 ? ` (${fileItems.length})` : ""}
            </h4>
            <FileList
              files={fileItems}
              isOwner={isOwner}
              experimentId={e.id}
              removeAction={isOwner ? removeFile : undefined}
            />
          </div>

          {isOwner && (
            <FileManager
              uploadAction={uploadFile.bind(null, e.id)}
              linkAction={addFileLink.bind(null, e.id)}
            />
          )}

          <SummaryCard
            aiEnabled={aiEnabled}
            summary={summary}
            action={generateSummary.bind(null, e.id)}
          />

          <HistoryPanel current={e} revisions={revisions} />
        </aside>
      </div>
    </div>
  );
}
