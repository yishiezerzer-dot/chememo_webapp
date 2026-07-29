-- T0.11: tighten project deletion to owner-only.
-- Backfill the legacy seed reference projects (created before per-user ownership
-- existed) to a real owner first, so the tightened policy below doesn't
-- permanently strand them. No-op on environments with no null-owner rows, and
-- also a no-op (rather than a failed migration) on a fresh environment where
-- that account doesn't exist yet — e.g. CI's `rls` job builds a brand-new
-- local Supabase instance from this migration history + the seed data above,
-- which has no auth.users rows at all, so the bare UPDATE below violated
-- owner_id's foreign key and aborted the whole migration apply (broke CI on
-- 2026-07-28, unnoticed until 2026-07-29's T1.1 session).
do $$
begin
  if exists (select 1 from auth.users where id = 'cd102d14-5624-49e6-9e1f-ab5c7a2d8022') then
    update projects
    set owner_id = 'cd102d14-5624-49e6-9e1f-ab5c7a2d8022'
    where owner_id is null;
  end if;
end $$;

drop policy if exists projects_delete_own on projects;
create policy projects_delete_own on projects
  for delete to authenticated using (owner_id = auth.uid());
