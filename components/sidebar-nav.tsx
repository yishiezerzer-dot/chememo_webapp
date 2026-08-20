"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { Project } from "@/lib/types";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import { createProject, deleteProject } from "@/app/(app)/projects-actions";

const ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/experiments",
    label: "Experiments",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M3 14h18M9 4v16" />
      </svg>
    ),
  },
  {
    href: "/experiments/matrix",
    label: "Matrix",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 3v18M9 3v18M15 3v18M3 9h18M3 15h18" />
      </svg>
    ),
  },
  {
    href: "/experiments/map",
    label: "Map",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="7" r="2.5" />
        <circle cx="9" cy="18" r="2.5" />
        <path d="M8 7.5l7.5.5M7.5 8l1 8" />
      </svg>
    ),
  },
  {
    href: "/new",
    label: "New experiment",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />
        <path d="M7.5 14h9" />
      </svg>
    ),
  },
  {
    href: "/templates",
    label: "Templates",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    href: "/materials",
    label: "Materials",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 3h6M10 3v5l-6 10a2 2 0 0 0 1.8 3h12.4a2 2 0 0 0 1.8-3l-6-10V3" />
        <path d="M8 15h8" />
      </svg>
    ),
  },
  {
    href: "/instruments",
    label: "Instruments",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </svg>
    ),
  },
  {
    href: "/condition-programs",
    label: "Condition programs",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3a9 9 0 1 0 9 9" />
        <path d="M12 3v6l4-3" />
      </svg>
    ),
  },
  {
    href: "/ask",
    label: "Ask AI",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/plan",
    label: "Plan",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 12l2 2 4-4" />
        <rect x="3" y="4" width="18" height="16" rx="2" />
      </svg>
    ),
  },
  {
    href: "/health",
    label: "Health",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 12h4l2 7 4-14 2 7h6" />
      </svg>
    ),
  },
];

const SWATCHES = ["#3ee0c4", "#6fe3ff", "#7fd1ff", "#c2a3ff", "#ffd479", "#ff8fa3"];

export function SidebarNav({
  projects,
  currentUserId,
}: {
  projects: Project[];
  currentUserId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setBusyKey("add");
    const res = await createProject(name, color);
    setBusy(false);
    if (res.ok) {
      showToast("Project created", "success");
      setName("");
      setColor(SWATCHES[0]);
      setCreating(false);
      router.refresh();
    } else {
      showToast(res.error, "error");
    }
  }

  async function handleDelete(id: string) {
    if (busy) return;
    setBusy(true);
    setBusyKey(id);
    const res = await deleteProject(id);
    setBusy(false);
    if (res.ok) {
      showToast("Project deleted", "success");
      router.refresh();
    } else {
      showToast(res.error, "error");
    }
  }

  return (
    <>
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={false}
          className={`nav-item${pathname.startsWith(item.href) ? " active" : ""}`}
        >
          {item.icon} {item.label}
        </Link>
      ))}

      <div className="nav-sep"></div>
      <div className="eyebrow" style={{ padding: "0 14px 8px" }}>
        Projects
      </div>

      {projects.map((p) => {
        const canDelete = p.owner_id === currentUserId;
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Link
              href={`/experiments?project=${p.id}`}
              prefetch={false}
              className="nav-item"
              style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}
            >
              <span className="pdot" style={{ color: p.color ?? "var(--teal)" }}></span>{" "}
              <span
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {p.label}
              </span>
            </Link>
            {canDelete && (
              <button
                type="button"
                aria-label={`Delete ${p.label}`}
                onClick={() => handleDelete(p.id)}
                disabled={busy}
                aria-busy={busy && busyKey === p.id}
                className="btn-ghost btn-sm"
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--ink-mute)",
                  cursor: "pointer",
                  padding: "4px 8px",
                  flex: "none",
                }}
              >
                {busy && busyKey === p.id ? <Spinner /> : "×"}
              </button>
            )}
          </div>
        );
      })}

      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="nav-item"
          style={{ fontSize: 13.5, background: "none", border: "1px solid transparent", cursor: "pointer", width: "100%", textAlign: "left" }}
        >
          + New project
        </button>
      ) : (
        <form
          onSubmit={handleCreate}
          style={{
            padding: "8px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            autoFocus
            disabled={busy}
            style={{
              background: "rgba(255,255,255,.04)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "6px 10px",
              color: "var(--ink)",
              fontSize: 13,
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {SWATCHES.map((sw) => (
              <button
                key={sw}
                type="button"
                aria-label={`Color ${sw}`}
                onClick={() => setColor(sw)}
                disabled={busy}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: sw,
                  border: color === sw ? "2px solid var(--ink)" : "2px solid transparent",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="submit" className="btn btn-sm" disabled={busy} aria-busy={busy && busyKey === "add"}>
              {busy && busyKey === "add" && <Spinner />}
              Add
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                setCreating(false);
                setName("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </>
  );
}
