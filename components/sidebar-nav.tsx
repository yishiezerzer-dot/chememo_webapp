"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
];

const PROJECTS = [
  { label: "Wet–dry cycling", color: "#3ee0c4" },
  { label: "Depsipeptides", color: "#7fd1ff" },
  { label: "LC-MS/MS", color: "#c2a3ff" },
  { label: "Microscopy", color: "#ffd479" },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`nav-item${pathname.startsWith(item.href) ? " active" : ""}`}
        >
          {item.icon} {item.label}
        </Link>
      ))}

      <div className="nav-sep"></div>
      <div className="eyebrow" style={{ padding: "0 14px 8px" }}>
        Projects
      </div>
      {PROJECTS.map((p) => (
        <Link
          key={p.label}
          href="/experiments"
          className="nav-item"
          style={{ fontSize: 13.5 }}
        >
          <span className="pdot" style={{ color: p.color }}></span> {p.label}
        </Link>
      ))}
    </>
  );
}
