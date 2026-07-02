import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    "Researcher";

  return (
    <div>
      <span className="eyebrow">Dashboard</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 30, margin: "8px 0 18px" }}>
        Welcome, {name}
      </h2>
      <div className="glass" style={{ padding: "26px 28px", maxWidth: 640 }}>
        <p style={{ margin: 0, color: "var(--ink-dim)", lineHeight: 1.65 }}>
          Your MFP lab notebook is connected and your session is live. Experiment
          records, search and the AI assistant arrive in the next build phases —
          this dashboard will fill up as they land.
        </p>
      </div>
    </div>
  );
}
