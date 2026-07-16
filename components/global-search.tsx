"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Topbar search: Enter navigates to the Experiments table pre-filtered by q.
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      className="searchbox"
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        if (query) router.push(`/experiments?q=${encodeURIComponent(query)}`);
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search experiments…  ↵"
        aria-label="Global search"
      />
    </form>
  );
}
