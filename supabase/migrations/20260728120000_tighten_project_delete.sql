-- T0.11: tighten project deletion to owner-only.
-- Backfill the legacy seed reference projects (created before per-user ownership
-- existed) to a real owner first, so the tightened policy below doesn't
-- permanently strand them. No-op on environments with no null-owner rows.
update projects
set owner_id = 'cd102d14-5624-49e6-9e1f-ab5c7a2d8022'
where owner_id is null;

drop policy if exists projects_delete_own on projects;
create policy projects_delete_own on projects
  for delete to authenticated using (owner_id = auth.uid());
