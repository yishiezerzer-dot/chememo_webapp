import Link from "next/link";

// T1.2 D6 — 3 options, not the plan text's 5: "Continue a series" needs
// T1.7's experiment_series (not built) and "Import" names no source
// anywhere in the plan or standard. Both are added when their real
// dependency lands, rather than shipping disabled placeholders now.
const OPTIONS = [
  {
    href: "/new/template",
    title: "Start from template",
    body: "Pre-fill from a saved experiment template — planning sections, sample matrix, and controls.",
  },
  {
    href: "/new/clone",
    title: "Clone an experiment",
    body: "Copy selected sections from an existing experiment. Files, results, and history are never copied.",
  },
  {
    href: "/new/blank",
    title: "Blank",
    body: "Start from nothing.",
  },
];

export default function NewExperimentMenuPage() {
  return (
    <div>
      <span className="eyebrow">New experiment</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        How do you want to start?
      </h2>
      <div className="entry-menu-grid">
        {OPTIONS.map((o) => (
          <Link key={o.href} href={o.href} className="obs-box glass entry-menu-card">
            <h4 style={{ margin: "0 0 8px" }}>{o.title}</h4>
            <p className="sec-sub" style={{ margin: 0 }}>
              {o.body}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
