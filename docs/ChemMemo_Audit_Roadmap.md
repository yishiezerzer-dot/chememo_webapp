---
type: note
project: CM
title: ChemMemo — Audit & Roadmap
---

# ChemMemo Web App — Comprehensive Audit & Roadmap

Hub: [[ChemMemo]] · Vision: [[ChemMemo_Characterization]] · Build plan: [[ChemMemo_Implementation_Plan]]

**Project:** ChemMemo AI Lab Notebook  
**Stack:** Next.js 16.2 (App Router) · React 19.2 · TypeScript · Supabase (Postgres + Auth + Storage + pgvector) · Switchable AI (Gemini / OpenAI / Anthropic)  
**Audit date:** 2026-07-15 · **Last revised:** 2026-07-15  
**Scope:** Read-only analysis of the `dev` branch — no application code was modified during the audit itself.

---

## 0. Executive summary (TL;DR)

ChemMemo is **architecturally sound and already usable** as a keyless MVP, with the AI layer now live via Gemini. The codebase shows genuinely good instincts: clean server-only boundaries, an RLS-first security model, an inert-by-default AI design, and a switchable provider abstraction. Nothing here is a rewrite — the work is **finishing** and **hardening**.

**The five things that matter most (fix in this order):**

1. **Embeddings don't sync on create/edit** — new or edited experiments are invisible to semantic search until a manual backfill. This quietly erodes the flagship feature. *(P0 — Sprint S2)*
2. **Mobile navigation is broken** — the drawer CSS exists but nothing toggles it; the app is unusable on a phone in portrait. *(P0 — Sprint S1)*
3. **`EXP-###` IDs race** — concurrent creates can collide; replace the read-max-plus-one with a DB sequence. *(P0 — Sprint S2)*
4. **Not promoted to production** — prod Supabase still lacks the schema/storage/embeddings and env config. *(P0 — Sprint S6)*
5. **Trust gaps in the UI** — dead global-search box, non-filtering sidebar project chips, a hardcoded "100% Cited" stat, and no toast/error feedback on failed actions. *(P1 — Sprints S3–S4)*

**Already shipped since the first pass (do not re-implement):**
- ✅ Ask screen **loading state** — `components/ask-box.tsx` shows a "Thinking…" spinner during retrieval + generation (`useTransition`).
- ✅ **Dynamic answers** — questions that don't match any experiment fall back to a labelled general-knowledge answer (`generateGeneralAnswer` + a `SEMANTIC_MIN_SIMILARITY` threshold, default 0.5). Grounded answers keep `[EXP-###]` citations + Sources.

Everything else below stands. Priorities use **P0 (ship-blocking) → P3 (nice-to-have)**; the Sprint blueprint in §5 sequences them for an implementing agent.

---

## 1. UI/UX & Design Analysis

### Overall impression

ChemMemo has a **distinct, polished visual identity** — the "Laboratory at Night / Primordial Glow" theme in `app/chemmemo.css` is cohesive, memorable, and well-suited to a prebiotic-chemistry lab notebook. The mockup from `chemmemo-design/` was largely ported successfully: glass panels, bioluminescent accents, Fraunces + Sora + JetBrains Mono typography, and animated molecular backgrounds create strong brand presence.

The app shell (sidebar + sticky topbar + centered content) matches the intended 6-screen flow: Auth → Dashboard → Experiments table → New experiment → Ask AI → Experiment detail.

### Visual hierarchy & layout

**Strengths**

- Clear page hierarchy via `.eyebrow` → display heading → body copy pattern.
- Experiment detail uses a readable spec grid + aside for files/summary.
- Form is well-sectioned (Identity → Chemistry → Analysis → Observations) with a sticky save panel.
- Ask AI page centers the query experience and separates grounded vs. general answers.

**Friction points**

| Area | Issue | Impact |
|------|-------|--------|
| **Topbar global search** | Input in `app/(app)/layout.tsx` is decorative — no `onSubmit`, no navigation | Users expect global search; it does nothing |
| **Sidebar "Projects" links** | All four project chips link to `/experiments` with no filter pre-applied (`components/sidebar-nav.tsx`) | Broken mental model — chips look filterable but aren't |
| **Dashboard** | Missing mockup features: project chips, activity feed, meaningful stat deltas | Dashboard feels thinner than the design spec |
| **Stat card "100% Cited results"** | Hard-coded marketing copy, not computed (`dashboard/page.tsx`) | Undermines trust in a science notebook |
| **Mobile navigation** | CSS defines `.menu-toggle` and `.sidebar.open` at ≤820px, but **no hamburger button or toggle logic exists** | App is effectively unusable on phones/tablets in portrait |
| **`body.dim` class** | CSS rules exist for subdued backgrounds on non-hero pages, but **never applied in JSX** | Inner pages stay visually busy; hero band competes with content |
| **Inline styles** | Heavy use of `style={{…}}` alongside CSS classes | Harder to maintain; inconsistent spacing vs. design tokens |
| **Dual CSS systems** | `globals.css` imports Tailwind + sets Geist/Arial; `chemmemo.css` is the real design system | Tailwind is installed but unused; `globals.css` `:root` and `prefers-color-scheme` can fight `data-theme` |

### Design system critique

**Colors & theming**

- Dark/light via `data-theme` + `localStorage` (`cm-theme`) with FOUC prevention script — good pattern.
- Light-mode chip/accent adaptations use `color-mix()` — thoughtful.
- Theme toggle has no visible state indicator (same sun icon in both modes).

**Typography**

- Google Fonts loaded via `<link>` in `app/layout.tsx` rather than `next/font` — extra render-blocking request, no automatic subsetting.

**Responsiveness**

- Breakpoints at 1200 / 1100 / 960 / 820 / 480px are well thought out.
- Table horizontal scroll with `min-width: 860px` prevents column squash — good.
- **Critical gap:** mobile sidebar drawer CSS without JavaScript = broken mobile UX.

**Accessibility**

| Item | Status |
|------|--------|
| `:focus-visible` outlines | ✅ Present |
| `prefers-reduced-motion` | ✅ Comprehensive |
| Form labels | ✅ Mostly present |
| Sortable table headers | ❌ `<th onClick>` — not keyboard-operable, no `aria-sort` |
| Auth mode toggle | ⚠️ `<a role="button">` without `onKeyDown` for Enter/Space |
| Loading states | ⚠️ Ask box has transition spinner; forms/uploads lack consistent feedback |
| Color contrast (light mode) | ⚠️ Some `--ink-mute` on light panels may approach WCAG AA edge |
| Live regions for AI answers | ❌ No `aria-live` when results appear after navigation |

### User journey friction summary

1. **Login → Dashboard:** Smooth; session persists via middleware.
2. **Create experiment:** Form is excellent; AI paste-notes is a strong adoption lever when keys exist.
3. **Find experiment:** Table search/filters work well client-side; global search does not.
4. **Ask AI:** Works but full-page navigation on every query (`/ask?q=…`) causes scroll reset; no conversation history.
5. **Detail → Files:** Upload auto-submits on file pick — good; no progress bar for large files.
6. **Edit/Delete:** Two-step confirm on delete — good safety pattern.

---

## 2. Codebase & Architecture Review

### High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  Client islands: ExperimentsTable, ExperimentForm, AskBox,  │
│  ThemeToggle, FileManager, SummaryCard, PasteNotes          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Next.js App Router (Server Components + Server Actions)     │
│  middleware.ts → lib/supabase/middleware.ts (auth gate)      │
│  (app)/layout.tsx → auth check + shell                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  lib/experiments.ts  lib/search.ts     lib/rag.ts
  lib/embeddings.ts   lib/anthropic.ts  Server Actions
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
              Supabase (Postgres + Auth + Storage + pgvector)
                           │
                           ▼
              External AI APIs (Gemini / OpenAI / Anthropic)
```

### Structural integrity

**Strengths**

- Clean **server-only** boundaries (`import "server-only"` in data/AI libs).
- **Hybrid retrieval** is well-factored: `parseQuery` + `executeFilters` (deterministic) shared by keyless and AI paths; `semanticSearch` + `routeQuery` + `generateAnswer` layered on top.
- **RLS-first security model** — lab-shared read, edit-own; storage policies keyed to experiment ID path segment.
- **Inert-by-default AI** — `isLlmEnabled()` / `isEmbeddingEnabled()` guards allow keyless MVP without API cost.
- **Provider abstraction** in `lib/anthropic.ts` + `lib/embeddings.ts` — switchable via `AI_PROVIDER` env.
- **Soft delete** with RLS fix for owner visibility during delete operation.
- **Standalone output** in `next.config.ts` — Railway-ready.

**Weaknesses**

| Concern | Location | Risk |
|---------|----------|------|
| **Misnamed module** | `lib/anthropic.ts` handles Gemini + OpenAI + Anthropic | Confusing for maintainers |
| **No embedding sync on CRUD** | `createExperiment` / `updateExperiment` in `new/actions.ts` | New/edited experiments invisible to semantic search until manual backfill |
| **EXP-### ID race** | `nextExperimentId()` reads max + 1 | Duplicate IDs under concurrent creates |
| **Hardcoded sidebar projects** | `sidebar-nav.tsx` vs `projects` DB table | Drift when projects change in DB |
| **No error boundaries** | No `error.tsx` / `not-found.tsx` in route groups | Unhandled errors → white screen |
| **Silent action failures** | `createExperiment` returns early if `!input.name` | User gets no feedback |
| **Admin client usage** | `summary-actions.ts` only | Embeddings writes also need service role but aren't automated |
| **GET-based Ask queries** | `ask/page.tsx? q= searchParam` | Queries in URL/logs/history; not ideal for long or sensitive questions |
| **No automated tests in CI** | Scripts in `scripts/` only, excluded from tsconfig | Regressions in search/RAG undetected |
| **README** | Still default `create-next-app` boilerplate | Onboarding friction for collaborators |

### Component structure

- **Appropriate split:** Server pages fetch data; client components handle interactivity (table sort/filter, tag inputs, ask box transitions).
- **Form pattern:** Uncontrolled inputs with `defaultValue` + remount via `key={version}` for AI pre-fill — works but loses in-progress edits on re-extract.
- **Server Actions:** Colocated in `actions.ts` / `file-actions.ts` / `summary-actions.ts` — good Next.js convention.

### State management

- No global state library — correct for this scale.
- Local `useState` / `useMemo` / `useTransition` where needed.
- Theme in `localStorage` + `data-theme` — no React context required.
- **Missing:** optimistic UI, toast notifications, form-level error state from server actions.

### Data layer

- Supabase SSR via `@supabase/ssr` — correct cookie pattern in middleware + server client.
- `match_experiments` RPC with HNSW index — good pgvector setup.
- Signed URLs regenerated every detail page render (1-hour TTL) — simple and correct.

### Scalability notes

- Fine for lab scale (~hundreds of experiments).
- `loadVocab()` in `search.ts` loads all compounds/methods on every keyless search — acceptable now, cache later.
- Full experiment list fetched for dashboard/table — paginate when > ~500 rows.
- AI calls are synchronous blocking SSR on Ask page — needs streaming or route handler for latency at scale.

---

## 3. Debugging List

### Immediate-fix checklist

#### Security

- [ ] **Validate external link URLs** in `addFileLink` — restrict to `https://` (block `javascript:`, `data:`).
- [ ] **Sanitize free-text search tokens** in `executeFilters` — PostgREST `.or()` filter strings with `%` and `,` in user input can break or broaden queries unexpectedly.
- [ ] **Gemini API key in query string** (`?key=`) — risk of key exposure in server/proxy logs; prefer header-based auth when Gemini supports it for your tier.
- [ ] **No rate limiting** on AI server actions — one user can exhaust free-tier quota; add per-user throttle.
- [ ] **Service role key** — confirm never bundled client-side (currently server-only ✅); audit Railway env scoping per environment.

#### Data integrity bugs

- [ ] **Embedding drift:** Create/update experiment does not upsert `experiment_embeddings` → semantic search stale/missing for new records.
- [ ] **EXP-ID collision:** Concurrent `createExperiment` calls can produce duplicate `EXP-###` IDs (PK violation or overwrite attempt).
- [ ] **Soft delete orphans:** Deleting experiment does not remove storage objects, `experiment_files` rows, or `experiment_embeddings` (files cascade via FK on hard delete only; soft delete leaves orphans).
- [ ] **Summary cache stale:** Editing experiment does not invalidate `ai_summaries` — regenerate shows old context until manual regen.

#### UX / functional bugs

- [ ] **Mobile sidebar** — CSS drawer without toggle button; navigation unreachable on small screens.
- [ ] **Global search input** — non-functional placeholder in topbar.
- [ ] **Sidebar project links** — do not filter experiments table.
- [ ] **Auth toggle link** — keyboard activation incomplete on signup/signin switcher.
- [ ] **Table sort headers** — not accessible via keyboard.
- [ ] **Upload errors** — server action throws; no user-visible error message in UI.
- [ ] **createExperiment silent fail** — empty name returns without redirect or error.

#### AI / retrieval edge cases

- [ ] **Fragile grounded check:** `!/no matching experiments/i.test(grounded)` in `rag.ts` relies on the model reproducing an exact guardrail phrase, so paraphrases silently bypass it. **Fix:** have `generateAnswer` return structured output (e.g. `{ answered: boolean, text: string }` via a JSON/tool response) and branch on `answered`, rather than string-matching prose.
- [ ] **General answer fallback** when records exist but the generator declines — can answer from world knowledge even though lab data was retrieved. The "General answer" UI label mitigates this; the structured-output fix above removes the ambiguity entirely.
- [ ] **Keyless free-text** cannot handle negation ("experiments WITHOUT droplets") — documented; only relevant on the no-key keyless path (the AI path handles negation).
- [ ] **Router JSON parse failure** — falls back to keyless silently; consider a subtle "AI routing unavailable, showing keyword results" note so the user isn't misled about which engine answered.
- [ ] **`SEMANTIC_MIN_SIMILARITY` threshold** — default 0.5, **env-tunable** (empirically: on-topic ≈ 0.59–0.70, off-topic ≈ 0.41–0.46). Reasonable, but there is no UI hint when a borderline query is treated as "no match" → general answer.

#### Operational / deployment

- [ ] **Prod not promoted** — dev has full schema + AI; production Supabase may lack storage/migrations/embeddings.
- [ ] **Supabase Auth URL config** — email confirmation links may still point to localhost if Site URL / Redirect URLs not set on prod.
- [ ] **chememo-dev auto-pause** — free tier pauses after ~8 days idle; breaks dev demos without `restore_project`.
- [ ] **No Dockerfile** — relies on Railway auto-detect; `output: 'standalone'` set but no explicit container definition in repo.

#### Memory / performance

- [ ] **Animated backgrounds** — `will-change: transform` + infinite animations on fixed layers; minor GPU cost, mitigated by `prefers-reduced-motion`.
- [ ] **Signed URL batch** — `createSignedUrls` for all upload paths each render; fine for small file counts.
- [ ] **No streaming** — Ask page blocks until full RAG pipeline completes (embed + route + generate).

---

## 4. Recommended Changes (Short-to-Medium Term)

Prioritized by impact vs. effort.

### P0 — Ship-blocking / adoption

1. **Implement mobile navigation** — hamburger in topbar, toggle `sidebar.open`, backdrop click to close, trap focus in drawer.
2. **Wire global search** — topbar input navigates to `/experiments?q=…` or `/ask?q=…`; pass initial filter to `ExperimentsTable` via URL search param.
3. **Auto-sync embeddings on save** — after create/update server action, call `embedExperiment` + upsert via admin client (async, non-blocking preferred).
4. **Promote dev → prod** — apply all migrations to production Supabase; set Railway prod env vars (`AI_PROVIDER`, keys, Auth URLs); run backfill on prod.
5. **Replace EXP-ID generator with DB sequence** — migration: `create sequence experiment_id_seq;` + trigger or atomic SQL function.

### P1 — Trust & polish

6. **Add toast notification system** — success/error for upload, delete, save, AI generation (use existing `.toast` CSS class).
7. **Add `error.tsx` and `loading.tsx`** — at `(app)` layout level and `/ask` route.
8. **Apply `body.dim`** on non-dashboard routes via client effect or layout class.
9. **Fix sidebar projects** — fetch from `listProjects()` and link to `/experiments?project=wet-dry` (add URL param support to table).
10. **Update stale Phase 10 copy** — `paste-notes.tsx` / `summary-card.tsx` messages when `aiEnabled` is true (already conditional, but verify prod env).
11. **Dashboard activity feed** — query recent `experiments` by `updated_at`, show last 8 edits with links.
12. **Meaningful dashboard stats** — replace "100% Cited" with "AI queries this week" or "Experiments this month".

### P2 — Technical debt

13. **Rename `lib/anthropic.ts` → `lib/llm.ts`** — re-export for backward compat.
14. **Migrate fonts to `next/font`** — remove external Google Fonts `<link>`.
15. **Remove or commit to Tailwind** — either delete unused Tailwind setup or extract repeated inline styles to utilities.
16. **Consolidate README** — project-specific setup: env vars, Supabase link, dev/prod Railway URLs, backfill command.
17. **PostgREST filter escaping** — helper to escape `%`, `,`, `(`, `)` in free-text tokens before `.or()`.
18. **Invalidate summary on experiment update** — delete cached `ai_summaries` row when experiment fields change.

### P3 — Feature completeness (from characterization doc)

19. **Retrieval eval set** — `scripts/eval-retrieval.ts` + `eval/queries.json` with expected EXP-IDs; precision/recall report.
20. **Compound/metal autocomplete** — server action returning distinct values from DB for tag inputs.
21. **Group summary** — summarize filtered experiment set on Ask results or Experiments page.
22. **CSV export** — download filtered experiments as CSV from table toolbar.
23. **Ask AI POST + streaming** — move query to server action or route handler with streamed response; avoid URL logging.
24. **Edit history** — `experiment_revisions` table + trigger on update storing JSON diff.

---

## 5. Implementation Blueprint (Upgrade & Feature Roadmap)

> **Audience:** any capable coding agent (this repo was built with Claude; the blueprint is model-agnostic).  
> **Repo root:** `C:\dev\chememo_webapp`  
> **Constraint:** Next.js 16 has breaking changes vs. older training data — notably `params`/`searchParams` are now `Promise`s that must be `await`ed. Verify App-Router APIs against the installed version (`node_modules/next/dist/docs/` exists in this project) before using them.  
> **Branch strategy:** Implement on `dev`; do not merge to `master` until eval + smoke tests pass.

---

### Blueprint overview — 6 sprints

| Sprint | Goal | Est. files touched |
|--------|------|-------------------|
| S1 | Mobile nav + body.dim + global search | 5–7 |
| S2 | Embedding sync pipeline + ID sequence | 4–6 + 1 migration |
| S3 | URL-driven filters + sidebar projects | 4 |
| S4 | Toasts + error/loading boundaries | 6–8 |
| S5 | Retrieval eval framework | 3–4 |
| S6 | Prod promotion + verification runbook | 0 code (ops) + env |

Execute sprints in order. Each sprint ends with `npm run build` and manual smoke test.

---

### Sprint S1 — Mobile navigation, subdued backgrounds, global search

#### S1.1 — Mobile sidebar drawer

**Create:** `components/mobile-nav.tsx` (client component)

```tsx
"use client";
// State: isOpen: boolean
// Render: button.menu-toggle in topbar (only visible ≤820px via existing CSS)
// onClick: toggle class "open" on #sidebar element
// Also: fixed backdrop div when open; click backdrop → close
// Escape key → close
// On route change (usePathname effect) → close drawer
```

**Modify:** `app/(app)/layout.tsx`

- Import `MobileNavToggle` into topbar before `<h1>`.
- Add `id="sidebar"` is already present on `<aside>` — ensure toggle targets it.

**Modify:** `app/chemmemo.css` (optional)

- Add `.sidebar-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 40; }` for overlay.

**Acceptance criteria:**

- At 375px viewport, hamburger visible; tap opens sidebar; tap link navigates and closes drawer.
- Desktop unchanged (menu-toggle hidden).

#### S1.2 — Apply `body.dim` on inner pages

**Create:** `components/page-body-class.tsx` (client)

```tsx
"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
// If pathname !== "/dashboard", document.body.classList.add("dim")
// Else remove "dim"
// Cleanup on unmount
```

**Modify:** `app/(app)/layout.tsx` — render `<PageBodyClass />` inside shell.

#### S1.3 — Functional global search

**Modify:** `app/(app)/layout.tsx`

- Extract topbar search into client component `components/global-search.tsx`.
- On Enter: `router.push('/experiments?q=' + encodeURIComponent(query))`.

**Modify:** `components/experiments-table.tsx`

- Accept optional prop `initialQuery?: string` OR read `useSearchParams().get('q')` to seed `q` state.
- Accept optional `initialProject?: string` from `?project=`.

**Modify:** `app/(app)/experiments/page.tsx`

```tsx
// export default async function ExperimentsPage({ searchParams }: { searchParams: Promise<{ q?: string; project?: string }> })
// Pass resolved params to ExperimentsTable
```

**Acceptance criteria:**

- Typing in topbar search + Enter filters experiments table.
- Direct URL `/experiments?q=histidine` pre-filters.

---

### Sprint S2 — Embedding sync + atomic experiment IDs

#### S2.1 — Database sequence for EXP IDs

**Create migration:** `supabase/migrations/20260715100000_experiment_id_sequence.sql`

```sql
-- Create sequence starting after current max EXP number
DO $$
DECLARE max_num int;
BEGIN
  SELECT coalesce(max(cast(substring(id from 5) as int)), 0) INTO max_num
  FROM experiments WHERE id ~ '^EXP-\d+$';
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS experiment_id_seq START WITH %s', max_num + 1);
END $$;

CREATE OR REPLACE FUNCTION next_experiment_id()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'EXP-' || lpad(nextval('experiment_id_seq')::text, 3, '0');
$$;

GRANT EXECUTE ON FUNCTION next_experiment_id() TO authenticated;
```

**Create:** `lib/experiment-id.ts` (server-only)

```ts
import { createClient } from "@/lib/supabase/server";
export async function nextExperimentId(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("next_experiment_id");
  if (error) throw error;
  return data as string;
}
```

**Modify:** `app/(app)/new/actions.ts`

- Remove local `nextExperimentId` function.
- Import from `lib/experiment-id.ts`.

#### S2.2 — Embedding sync service

**Create:** `lib/sync-embedding.ts` (server-only)

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { embedExperiment, isEmbeddingEnabled } from "@/lib/embeddings";

export async function syncExperimentEmbedding(
  experimentId: string
): Promise<void> {
  if (!isEmbeddingEnabled()) return;

  const admin = createAdminClient();
  const { data: e } = await admin
    .from("experiments")
    .select("id, name, reaction_type, compounds, metals, methods, observations, notes")
    .eq("id", experimentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!e) {
    // Soft-deleted → remove embedding
    await admin.from("experiment_embeddings").delete().eq("experiment_id", experimentId);
    return;
  }
  const payload = await embedExperiment(e);
  if (!payload) return;
  await admin.from("experiment_embeddings").upsert({
    experiment_id: experimentId,
    content: payload.content,
    embedding: payload.embedding,
    updated_at: new Date().toISOString(),
  });
}
```

**Modify:** `app/(app)/new/actions.ts`

- After successful `insert` in `createExperiment`: `await syncExperimentEmbedding(id)` (wrap in try/catch; log error, don't block redirect).
- After successful `update` in `updateExperiment`: same call.
- After `softDeleteExperiment`: call sync (will delete embedding).

**Optional — fire-and-forget:** Use `waitUntil` from Next.js 16 if available, or void the promise with `.catch(console.error)` to avoid blocking redirect on slow embed API.

**Acceptance criteria:**

- Create new experiment → row appears in `experiment_embeddings` within 30s (with key set).
- Edit observations → embedding `content` and vector update.
- Soft delete → embedding row removed.

---

### Sprint S3 — Sidebar projects + URL filter parity

#### S3.1 — Dynamic sidebar projects

**Modify:** `components/sidebar-nav.tsx`

- Change to accept `projects: Project[]` prop.
- Map DB projects to links: `href={/experiments?project=${p.id}}`.
- Keep hardcoded colors as fallback map: `{ "wet-dry": "#3ee0c4", ... }` or use `p.color` from DB.

**Modify:** `app/(app)/layout.tsx`

- Fetch projects server-side: `const projects = await listProjects();`
- Pass to `<SidebarNav projects={projects} />`.

#### S3.2 — ExperimentsTable project URL param

**Modify:** `components/experiments-table.tsx`

- Initialize `project` state from `initialProject` prop (default `"all"`).
- When `initialProject` changes (navigation), sync state via `useEffect`.

**Acceptance criteria:**

- Click "Wet–dry cycling" in sidebar → table shows only that project's experiments.

---

### Sprint S4 — Toasts, error boundaries, action feedback

#### S4.1 — Toast provider

**Create:** `components/toast-provider.tsx` (client)

- React context with `showToast(message: string, kind: 'success' | 'error')`.
- Render single `.toast` element; toggle `.show` class; auto-dismiss 3s.
- CSS already exists in `chemmemo.css` lines 869–880.

**Modify:** `app/(app)/layout.tsx` — wrap children with `<ToastProvider>`.

#### S4.2 — Server action error handling pattern

**Modify:** `app/(app)/new/actions.ts`, `file-actions.ts`, `summary-actions.ts`

- Return `{ ok: true } | { ok: false; error: string }` instead of bare throw where user-facing.
- Client forms call action and invoke `showToast` on result.

**Alternative (simpler):** Use `useActionState` (React 19) in form components.

#### S4.3 — Route error UI

**Create:**

- `app/(app)/error.tsx` — client error boundary with "Something went wrong" + retry button.
- `app/(app)/loading.tsx` — skeleton using `.glass` panels.
- `app/(app)/ask/loading.tsx` — AI-specific "Searching notebook…" spinner (reuse AskBox animation).

**Acceptance criteria:**

- Failed upload shows toast with error message.
- Thrown error in server component shows error boundary, not blank page.

---

### Sprint S5 — Retrieval eval framework

#### S5.1 — Eval dataset

**Create:** `eval/retrieval-queries.json`

```json
[
  {
    "id": "q01",
    "query": "Which samples produced droplets?",
    "expected_ids": ["EXP-004", "EXP-006", "EXP-012"],
    "mode": "semantic"
  },
  {
    "id": "q02",
    "query": "Experiments with m/z 297",
    "expected_ids": ["EXP-001", "EXP-004", "EXP-008", "EXP-009", "EXP-011"],
    "mode": "filter"
  },
  {
    "id": "q03",
    "query": "Wet–dry cycling at pH above 8",
    "expected_ids": ["EXP-004", "EXP-009"],
    "mode": "filter"
  }
]
```

Add to 10 queries covering PDF §7 examples.

#### S5.2 — Eval script

**Create:** `scripts/eval-retrieval.ts`

```ts
// node --env-file=.env.local scripts/eval-retrieval.ts
// For each query in eval/retrieval-queries.json:
//   1. Call internal retrieval only (no LLM generation):
//      - parseQuery + executeFilters for filter mode
//      - semanticSearch for semantic mode
//      - askAI but strip generateAnswer for hybrid
//   2. Compare retrieved IDs to expected_ids
//   3. Compute precision@k, recall@k
// Print markdown table to stdout; exit 1 if recall < 0.8 on any critical query
```

**Logic flow:**

```
eval-queries.json
       │
       ▼
┌──────────────────┐     filter path      ┌─────────────────┐
│  For each query  │ ───────────────────► │ executeFilters  │
└──────────────────┘                      └────────┬────────┘
       │                                           │
       │ semantic path                             │
       ▼                                           ▼
┌──────────────────┐                      ┌─────────────────┐
│ semanticSearch   │                      │  Set<ID> hits   │
└──────────────────┘                      └────────┬────────┘
                                                   │
                                                   ▼
                                          Compare to expected_ids
                                          Report P/R/F1 per query
```

**Add npm script:** `"eval:retrieval": "node --env-file=.env.local scripts/eval-retrieval.ts"`

**Acceptance criteria:**

- Script runs against dev Supabase with embeddings backfilled.
- Outputs per-query recall; overall summary.

---

### Sprint S6 — Production promotion runbook (ops, not code)

Execute manually or via Supabase CLI with approval gates.

#### S6.1 — Supabase prod migrations

```bash
# From repo root, linked to prod project
supabase db push --project-ref iazuubcyxneavrahjgww
# Verify: storage bucket, match_experiments function, experiment_id_seq
```

#### S6.2 — Supabase Auth URL configuration (prod)

In Supabase Dashboard → Authentication → URL Configuration:

- **Site URL:** `https://chememowebapp-production.up.railway.app`
- **Redirect URLs:**
  - `https://chememowebapp-production.up.railway.app/auth/callback`
  - `http://localhost:3000/auth/callback`

#### S6.3 — Railway production environment variables

Set on production service (mirror dev):

```
NEXT_PUBLIC_SUPABASE_URL=<prod url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<prod anon>
SUPABASE_SERVICE_ROLE_KEY=<prod service role>
AI_PROVIDER=gemini
GEMINI_API_KEY=<key>
GEMINI_CHAT_MODEL=gemini-flash-latest
GEMINI_EMBED_MODEL=gemini-embedding-001
SEMANTIC_MIN_SIMILARITY=0.5
```

#### S6.4 — Prod embedding backfill

```bash
node --env-file=.env.local scripts/backfill-embeddings.ts
# Use prod credentials in .env.local temporarily OR pass env vars
```

#### S6.5 — Prod smoke test checklist

1. Sign up / sign in on production URL.
2. Create experiment → appears in table → detail correct.
3. Upload image → opens via signed URL.
4. Ask "pH above 8 cycling" → grounded answer with [EXP-###] citations.
5. Generate summary on detail page → cached in `ai_summaries`.
6. Paste notes on /new → fields pre-filled.
7. Mobile viewport → sidebar toggle works.

---

### Advanced features (post-sprint backlog for Sonnet)

#### A1 — Ask AI streaming via Route Handler

**Create:** `app/api/ask/route.ts`

```
POST { query: string }
→ Auth: createClient + getUser (401 if none)
→ Run askAI pipeline but split:
   - Retrieval synchronously
   - generateAnswer with streaming (Gemini streamGenerateContent / Anthropic stream / OpenAI stream)
→ Return ReadableStream text/plain or SSE
```

**Modify:** `components/ask-box.tsx`

- Replace `router.push` with `fetch('/api/ask', { method: 'POST', body })` + stream reader.
- Render tokens incrementally in `.msg-ai` container.

**Modify:** `app/(app)/ask/page.tsx`

- Default view without query; results rendered client-side only (page becomes shell).

#### A2 — Group summary

**Create:** `lib/summarize-group.ts`

- Input: `Experiment[]`
- Prompt: "Summarize these N experiments… cite each [EXP-###] once…"
- Cache in `ai_summaries` with `scope = 'group'` and `source_ids = [...ids]`.

**Modify:** `app/(app)/ask/page.tsx` — when grounded results > 1, show "Summarize these N experiments" button.

#### A3 — Compound autocomplete

**Create:** `lib/vocab.ts`

```ts
export async function suggestCompounds(prefix: string): Promise<string[]>
// SELECT distinct unnest(compounds) FROM experiments WHERE deleted_at IS NULL
// Filter ilike prefix, limit 10
```

**Modify:** `components/experiment-form.tsx` TagField — show dropdown on input with suggestions.

#### A4 — CSV export

**Create:** `app/api/export/experiments/route.ts`

- Auth gated.
- Accept same filter params as table.
- Return `text/csv` with core columns.

**Modify:** `components/experiments-table.tsx` — "Export CSV" button linking to API with current filter query string.

#### A5 — Edit history

**Migration:** `experiment_revisions` table

```sql
create table experiment_revisions (
  id uuid primary key default gen_random_uuid(),
  experiment_id text references experiments(id) on delete cascade,
  editor_id uuid references auth.users(id),
  snapshot jsonb not null,
  created_at timestamptz default now()
);
```

**Trigger:** `AFTER UPDATE ON experiments` → insert prior row JSON.

**UI:** "History" panel on detail page listing revisions with diff summary.

---

### File structure after all sprints

```
chememo_webapp/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx          # + ToastProvider, PageBodyClass, GlobalSearch
│   │   ├── loading.tsx         # NEW
│   │   ├── error.tsx           # NEW
│   │   ├── ask/
│   │   │   ├── page.tsx
│   │   │   └── loading.tsx     # NEW
│   │   └── experiments/
│   │       └── page.tsx        # + searchParams
│   └── api/
│       ├── ask/route.ts        # A1 — streaming
│       └── export/experiments/route.ts  # A4
├── components/
│   ├── mobile-nav.tsx          # NEW S1
│   ├── global-search.tsx       # NEW S1
│   ├── page-body-class.tsx     # NEW S1
│   ├── toast-provider.tsx      # NEW S4
│   └── sidebar-nav.tsx         # MODIFIED S3
├── lib/
│   ├── llm.ts                  # RENAMED from anthropic.ts
│   ├── sync-embedding.ts       # NEW S2
│   ├── experiment-id.ts        # NEW S2
│   └── vocab.ts                # A3
├── eval/
│   └── retrieval-queries.json  # NEW S5
├── scripts/
│   └── eval-retrieval.ts       # NEW S5
└── supabase/migrations/
    └── 20260715100000_experiment_id_sequence.sql  # NEW S2
```

---

### Dependencies — no new packages required for S1–S6

All sprints use existing stack. Optional additions for advanced features:

| Package | Purpose | When |
|---------|---------|------|
| `zod` | Validate server action inputs + API bodies | S4+ |
| `sonner` or custom | Toasts | S4 (custom preferred — CSS exists) |
| `papaparse` | CSV export | A4 |

---

### Sonnet execution instructions (meta)

1. **Read first:** `docs/ChemMemo_Implementation_Plan.md` Progress log; `app/chemmemo.css` for class names; `node_modules/next/dist/docs/` for Next.js 16 patterns.
2. **Never commit:** `.env.local`, API keys, service role keys.
3. **Test loop:** `npm run build` after each sprint; manual browser test at `localhost:3000`.
4. **Preserve behavior:** Keyless fallback when no AI key must continue working.
5. **Minimal diffs:** Do not refactor unrelated files; match existing code style (plain CSS classes, server actions, `"server-only"` guards).
6. **Migration safety:** New SQL migrations must be idempotent where possible (`IF NOT EXISTS`).
7. **Verify AI path:** After S2, run `node --env-file=.env.local scripts/verify-ai.ts` if present, plus `scripts/eval-retrieval.ts` after S5.

---

### Success definition (lab-ready)

ChemMemo is **production-ready for daily lab use** when:

- [ ] Prod Supabase has full schema + storage + embeddings backfilled
- [ ] All S1–S4 UX fixes shipped (mobile nav, search, toasts, errors)
- [ ] Embedding sync keeps semantic search current on every save
- [ ] Retrieval eval ≥ 80% recall on all 10 benchmark queries
- [ ] A lab member can log an experiment in < 2 minutes and find it via Ask AI with correct citations

---

## Related notes

- [[ChemMemo]] — project hub (status, locked decisions, secrets checklist).
- [[ChemMemo_Implementation_Plan]] — phased build plan + progress log (Phases 0–10). This audit's roadmap feeds back into it: P0/P1 items should become plan checklist entries.
- [[ChemMemo_Characterization]] — the vision / MVP definition. §3–§4 "feature completeness" items trace back to its good-to-haves.

> **How to use this audit:** treat §0 as the standing priority list, §3 as the bug backlog, and §5 as the execution plan. When an item ships, tick it here **and** log it in [[ChemMemo_Implementation_Plan]] so the two stay in sync.

---

*End of audit document.*
