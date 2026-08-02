"use client";

import { useState } from "react";
import Link from "next/link";
import type { Experiment } from "@/lib/types";

// Simple client-side filter over the already-fetched list, same approach
// experiments-table.tsx uses today (server-side search/pagination is T1.6).
export function ClonePickerClient({ experiments }: { experiments: Experiment[] }) {
  const [q, setQ] = useState("");
  const filtered = experiments.filter((e) =>
    `${e.id} ${e.name}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or ID…"
        style={{ marginBottom: 16, maxWidth: 400 }}
      />
      <div className="entry-menu-grid">
        {filtered.map((e) => (
          <Link key={e.id} href={`/new/clone/${e.id}`} className="obs-box glass entry-menu-card">
            <div className="id" style={{ fontSize: 12 }}>
              {e.short_code}
            </div>
            <h4 style={{ margin: "4px 0 0" }}>{e.name}</h4>
          </Link>
        ))}
      </div>
    </div>
  );
}
