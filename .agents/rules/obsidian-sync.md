# ChemMemo Obsidian Vault Synchronization Rule

When working on this repository (`c:\dev\chememo_webapp`), you MUST keep the project's Obsidian vault at `C:\Claude_code_projects\ChemMemo` synchronized with code changes, architecture decisions, and session milestones.

## Vault Path
`C:\Claude_code_projects\ChemMemo`

## Mandatory Actions on Changes / Milestones
1. **Log Progress in Implementation Plan:**
   - Prepend a dated entry to `C:\Claude_code_projects\ChemMemo\Plans\ChemMemo_Implementation_Plan.md` under `## Progress log -> **Session history**`.
   - Record exact commit hashes, files modified, root cause analyses, local test gate results, and database/UI verifications.
2. **Update Project Hub:**
   - Update `updated: YYYY-MM-DD` and `next_action: "..."` in the frontmatter of `C:\Claude_code_projects\ChemMemo\ChemMemo.md`.
3. **Spec-First Alignment:**
   - If introducing or modifying features, keep the corresponding spec in `C:\Claude_code_projects\ChemMemo\Specs\ChemMemo_Feature_<Name>_Spec.md` aligned.
4. **Follow Obsidian Syntax:**
   - Use `[[wikilinks]]` for internal note connections.
   - Use Obsidian callouts (`> [!tip]`, `> [!warning]`, `> [!success]`, `> [!important]`, `> [!note]`).
   - Preserve YAML frontmatter.
