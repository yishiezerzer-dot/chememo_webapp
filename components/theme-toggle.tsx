"use client";

export function ThemeToggle() {
  function toggle() {
    const html = document.documentElement;
    const next = html.dataset.theme === "light" ? "dark" : "light";
    html.dataset.theme = next;
    try {
      localStorage.setItem("cm-theme", next);
    } catch {}
  }

  return (
    <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
      </svg>
    </button>
  );
}
