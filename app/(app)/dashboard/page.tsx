import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listExperiments, listProjects } from "@/lib/experiments";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ data: { user } }, experiments, projects] = await Promise.all([
    supabase.auth.getUser(),
    listExperiments(),
    listProjects(),
  ]);

  const name =
    (user?.user_metadata?.full_name as string | undefined) || user?.email || "Researcher";

  const projectLabel = Object.fromEntries(projects.map((p) => [p.id, p.label]));
  const withMetals = experiments.filter((e) => e.metals.length > 0).length;
  const recent = experiments.slice(0, 6);

  const now = new Date();
  const loggedThisMonth = experiments.filter((e) => {
    const d = new Date(e.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  const stats = [
    { num: experiments.length, lbl: "Experiments" },
    { num: projects.length, lbl: "Project streams" },
    { num: withMetals, lbl: "Metal-containing" },
    { num: loggedThisMonth, lbl: "Logged this month" },
  ];

  return (
    <div>
      <div className="hero-band" style={{ borderRadius: "var(--radius)", padding: "28px 30px", marginBottom: 24, position: "relative", overflow: "hidden" }}>
        <div className="band-bg">
          <div className="band-img"></div>
          <div className="band-grad"></div>
        </div>
        <div className="band-inner">
          <span className="eyebrow">Dashboard</span>
          <h2>Welcome back, {name}</h2>
          <p>
            Your MFP lab notebook — structured records, linked files, and exact
            keyless search across every experiment.
          </p>
          <div className="hero-actions">
            <Link href="/new" className="btn btn-primary btn-sm">
              + New experiment
            </Link>
            <Link href="/ask" className="btn btn-ghost btn-sm">
              Ask your notebook
            </Link>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map((s) => (
          <div key={s.lbl} className="stat glass">
            <div className="num">{s.num}</div>
            <div className="lbl">{s.lbl}</div>
          </div>
        ))}
      </div>

      <div className="section-title">
        <h3 style={{ fontFamily: "var(--display)", fontSize: 19, margin: 0 }}>
          Recent experiments
        </h3>
        <Link href="/experiments" className="muted" style={{ fontSize: 13 }}>
          View all →
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="empty-state">
          <div className="big">No experiments yet</div>
          <Link href="/new" className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>
            Log your first experiment
          </Link>
        </div>
      ) : (
        <div className="card-grid">
          {recent.map((e) => (
            <Link key={e.id} href={`/experiments/${e.id}`} className="exp-card glass">
              <div className="ec-top">
                <span className="ec-id">{e.id}</span>
                {e.project && <span className="tag">{projectLabel[e.project] ?? e.project}</span>}
              </div>
              <h4>{e.name}</h4>
              <div className="ec-meta">
                {e.metals.map((m) => (
                  <span key={m} className="tag">
                    {m}
                  </span>
                ))}
              </div>
              <div className="ec-foot">
                {e.ph !== null && <span className="ph">pH {e.ph}</span>}
                {e.cycles !== null && <span>{e.cycles} cyc</span>}
                {e.date && <span>{e.date}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
