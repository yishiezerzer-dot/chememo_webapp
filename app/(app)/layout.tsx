import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listProjects } from "@/lib/projects/service";
import { BrandMark } from "@/components/brand-mark";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "@/components/mobile-nav";
import { PageBodyClass } from "@/components/page-body-class";
import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { unreadCount } from "@/lib/notifications/service";
import { ToastProvider } from "@/components/toast-provider";

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

  const [projects, unread] = await Promise.all([listProjects(), unreadCount(user.id)]);

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
    <ToastProvider>
    <div className="app active">
      <PageBodyClass />
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

        <SidebarNav projects={projects} currentUserId={user.id} />

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
          <MobileNav />
          <h1>ChemMemo</h1>
          <div className="spacer"></div>
          <GlobalSearch />
          <NotificationBell count={unread} />
          <ThemeToggle />
        </header>

        <div className="view">{children}</div>
      </main>
    </div>
    </ToastProvider>
  );
}
