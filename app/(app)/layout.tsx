import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand-mark";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email ||
    "Researcher";
  const initials = fullName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="app active">
      <aside className="sidebar" id="sidebar">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">
              Chem<b>Memo</b>
            </div>
            <div className="brand-sub">MFP Lab</div>
          </div>
        </div>

        <SidebarNav />

        <div className="sidebar-foot">
          <div className="user-pill">
            <span className="avatar">{initials}</span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fullName}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-mute)",
                  fontFamily: "var(--mono)",
                }}
              >
                Researcher
              </div>
            </div>
          </div>
          <form action="/auth/signout" method="post" style={{ marginTop: 8 }}>
            <button
              type="submit"
              className="btn btn-ghost btn-sm"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>ChemMemo</h1>
          <div className="spacer"></div>
          <div className="searchbox">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input placeholder="Search experiments…  ↵" aria-label="Global search" />
          </div>
          <ThemeToggle />
        </header>

        <div className="view">{children}</div>
      </main>
    </div>
  );
}
