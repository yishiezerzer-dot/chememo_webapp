-- Fix: soft-delete was self-blocking. The experiments SELECT policy was
-- `deleted_at is null`, so the moment an owner set deleted_at the written row
-- no longer satisfied SELECT and the UPDATE failed the row-security check.
-- Broaden read so an owner can still see their own (incl. soft-deleted) rows;
-- other users still cannot see rows once soft-deleted. App list queries keep
-- filtering `deleted_at is null` themselves, so trash stays out of normal views.

drop policy experiments_read on experiments;
create policy experiments_read on experiments
  for select to authenticated
  using (deleted_at is null or owner_id = auth.uid());

-- Same reasoning for files tied to an owned experiment.
drop policy experiment_files_read on experiment_files;
create policy experiment_files_read on experiment_files
  for select to authenticated using (
    exists (
      select 1 from experiments e
      where e.id = experiment_id
        and (e.deleted_at is null or e.owner_id = auth.uid())
    )
  );
