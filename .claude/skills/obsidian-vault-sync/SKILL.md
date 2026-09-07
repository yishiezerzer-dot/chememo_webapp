---
name: obsidian-vault-sync
description: Keep the ChemMemo Obsidian vault (C:\Claude_code_projects\ChemMemo) synchronized with code changes, bug fixes, architecture decisions, and session milestones. Use whenever modifying the codebase, shipping a feature, completing a QA pass, or closing a task.
---

# Obsidian Vault Synchronization Skill

This skill governs how agents maintain the ChemMemo Obsidian project vault at `C:\Claude_code_projects\ChemMemo`.

## Vault Location & Structure

- **Vault Path:** `C:\Claude_code_projects\ChemMemo`
- **Main Hub:** `C:\Claude_code_projects\ChemMemo\ChemMemo.md`
- **Plans & Logs:** `C:\Claude_code_projects\ChemMemo\Plans\`
  - `ChemMemo_Implementation_Plan.md` (Master session history & progress log)
  - `ChemMemo_Product_Evolution_Plan.md` (Tier 0–Tier 4 roadmap & guardrails)
- **Feature Specs:** `C:\Claude_code_projects\ChemMemo\Specs\` (`ChemMemo_Feature_<Name>_Spec.md`)
- **Domain Standards:** `C:\Claude_code_projects\ChemMemo\Standards\`
- **Audits & QA:** `C:\Claude_code_projects\ChemMemo\Audits\`
- **Vision:** `C:\Claude_code_projects\ChemMemo\Vision\`

---

## When to Update the Vault

Update the vault immediately upon:
1. **Completing a code change / bug fix / refactor:** Record the change, commit hash, verified database state, and rationale.
2. **Ending a work session / task milestone:** Update the progress log and next actions.
3. **Designing a new feature (`⚠ spec-first`):** Create or update a spec note in `Specs/` before implementing.
4. **Closing an audit or QA finding:** Mark items resolved in `Audits/` and `Plans/`.

---

## Update Workflow: Step-by-Step

### 1. Update `Plans/ChemMemo_Implementation_Plan.md`
Prepend a new session entry under `## Progress log -> **Session history**`:
```markdown
- YYYY-MM-DD (summary headline) — **[Detailed description of what was done]**. Include:
  - Commit hashes and file paths touched.
  - Root-cause analysis and rationale for the fix/feature.
  - Exact tests run (e.g. typecheck, lint, unit tests, e2e) and results.
  - Verification against the live database / UI.
  - Any open decisions, caveats, or follow-ups left for the user.
```
Update the status table in `ChemMemo_Implementation_Plan.md` if a phase or milestone was completed.

### 2. Update `ChemMemo.md` (Project Hub)
- Update `updated: YYYY-MM-DD` in the frontmatter.
- Update `next_action: "..."` in the frontmatter with the latest status, findings, and immediate next steps.
- Update any relevant status callouts or checklist items in the body.

### 3. Update or Create Feature Specs (`Specs/`)
If working on a specific feature:
- Ensure the note starts with standard YAML frontmatter:
  ```yaml
  ---
  type: spec
  project: ChemMemo
  title: ChemMemo — Feature Name Spec
  status: draft | in-progress | implemented | shipped
  tags:
    - chememo
    - chememo/spec
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  ---
  ```
- Use `[[wikilinks]]` for referencing other notes (e.g. `[[ChemMemo]]`, `[[ChemMemo_MFP_Lab_Notebook_Standard]]`).
- Document key design decisions with stable identifiers (e.g., `D1`, `D2`, `D3...`).

---

## Obsidian Markdown Conventions & Best Practices

1. **Internal Links:** Always use `[[Note Name]]` or `[[Note Name#Heading]]` or `[[Note Name|Alias]]` for vault notes. Do NOT use file:// links or relative markdown links inside vault notes.
2. **Callouts:** Use GitHub/Obsidian callouts for structured emphasis:
   - `> [!note]` (Context / general notes)
   - `> [!tip]` (Best practices / suggestions)
   - `> [!important]` (Critical requirements)
   - `> [!warning]` (Alerts / caveats)
   - `> [!danger]` (High risk / breaking rules)
   - `> [!success]` (Shipped / verified items)
3. **Traceability:** Explicitly mention commit hashes, SQL migration names, and database column names.
4. **Honest Reporting:** Never hide failed tests, flaky behaviors, or edge cases. State what was verified in DB vs what was verified in UI.
