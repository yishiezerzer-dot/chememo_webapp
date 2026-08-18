import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// T1.2 D6 — 3 options, not the plan text's 5: "Continue a series" needs
// T1.7's experiment_series (not built) and "Import" names no source
// anywhere in the plan or standard. Both are added when their real
// dependency lands, rather than shipping disabled placeholders now.
//
// The options are now checked against what actually exists (2026-08-18).
// Two of the three cannot work in a brand-new notebook — there is nothing to
// template from and nothing to clone — yet they were presented identically
// to the one that does, so a new user's very first action had a two-in-three
// chance of landing somewhere empty. They now say why, and point at the thing
// that would make them usable.
export default async function NewExperimentMenuPage() {
  const supabase = await createClient();

  const [{ count: templateCount }, { count: experimentCount }] = await Promise.all([
    supabase.from("experiment_templates").select("id", { count: "exact", head: true }),
    supabase.from("experiments").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);

  const options = [
    {
      href: "/new/template",
      title: "Start from template",
      body: "Pre-fill from a saved experiment template — planning sections, sample matrix, and controls.",
      available: (templateCount ?? 0) > 0,
      blockedBy: "You have no templates yet.",
      fix: { href: "/templates/new", label: "Create a template" },
    },
    {
      href: "/new/clone",
      title: "Clone an experiment",
      body: "Copy selected sections from an existing experiment. Files, results, and history are never copied.",
      available: (experimentCount ?? 0) > 0,
      blockedBy: "You have no experiments to clone yet.",
      fix: { href: "/new/blank", label: "Start a blank one instead" },
    },
    {
      href: "/new/blank",
      title: "Blank",
      body: "Start from nothing.",
      available: true,
      blockedBy: null,
      fix: null,
    },
  ];

  return (
    <div>
      <span className="eyebrow">New experiment</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        How do you want to start?
      </h2>
      <div className="entry-menu-grid">
        {options.map((o) =>
          o.available ? (
            <Link key={o.href} href={o.href} className="obs-box glass entry-menu-card">
              <h4 style={{ margin: "0 0 8px" }}>{o.title}</h4>
              <p className="sec-sub" style={{ margin: 0 }}>
                {o.body}
              </p>
            </Link>
          ) : (
            // Deliberately not a link: sending someone to a page whose only
            // message is "nothing here" is worse than saying so up front.
            <div key={o.href} className="obs-box entry-menu-card is-unavailable" aria-disabled="true">
              <h4 style={{ margin: "0 0 8px" }}>{o.title}</h4>
              <p className="sec-sub" style={{ margin: 0 }}>
                {o.body}
              </p>
              <p className="sec-sub" style={{ margin: "10px 0 0", color: "var(--amber)" }}>
                {o.blockedBy}
              </p>
              {o.fix && (
                <Link href={o.fix.href} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>
                  {o.fix.label}
                </Link>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
