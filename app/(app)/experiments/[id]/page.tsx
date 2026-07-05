import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExperiment, listProjects } from "@/lib/experiments";
import { softDeleteExperiment } from "@/app/(app)/new/actions";
import { DeleteExperimentButton } from "@/components/delete-experiment-button";

const FILE_ICONS: Record<string, string> = {
  excel: "M4 4h16v16H4z",
  folder: "M3 7h6l2 2h10v10H3z",
  image: "M4 5h16v14H4z",
  spectra: "M3 12h4l3-8 4 16 3-8h4",
  report: "M6 3h9l4 4v14H6z",
  si: "M12 3l9 5v8l-9 5-9-5V8z",
};

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, projects] = await Promise.all([getExperiment(id), listProjects()]);
  if (!result) notFound();
  const { experiment: e, files } = result;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = !!user && user.id === e.owner_id;

  const projectLabel = projects.find((p) => p.id === e.project)?.label ?? e.project;

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
              Files{files.length > 0 ? ` (${files.length})` : ""}
            </h4>
            {files.length === 0 ? (
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                No files linked.
              </p>
            ) : (
              <div className="files-list">
                {files.map((f) => {
                  const t = (f.file_type ?? "folder").toLowerCase();
                  return (
                    <div key={f.id} className="file-item">
                      <span className={`file-ico ${FILE_ICONS[t] ? t : "folder"}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                          <path d={FILE_ICONS[t] ?? FILE_ICONS.folder} />
                        </svg>
                      </span>
                      <span className="fname">{f.label ?? "(unnamed)"}</span>
                      <span className="ftype">{f.file_type ?? f.kind}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="ai-summary-card">
            <div className="ai-head">
              <h4>AI summary</h4>
            </div>
            <p className="muted" style={{ fontSize: 12.5 }}>
              Grounded AI summaries activate in Phase 10, once API keys are added.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
