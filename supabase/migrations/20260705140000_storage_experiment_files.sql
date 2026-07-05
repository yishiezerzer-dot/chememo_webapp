-- Phase 4 — file handling. Private bucket for uploaded images/spectra; big
-- folders are stored as external-link rows in experiment_files (no bucket).
-- Object path convention: '<experiment_id>/<filename>', so the first path
-- segment ties every object to an experiment and drives RLS.

insert into storage.buckets (id, name, public, file_size_limit)
values ('experiment-files', 'experiment-files', false, 10485760)  -- 10 MB
on conflict (id) do nothing;

-- NOTE: policies below match the object path's first segment against the set of
-- experiment ids via IN. Do NOT put `storage.foldername(name)` inside
-- `select ... from experiments e` — there, unqualified `name` binds to
-- experiments.name (the title), not the object path. See the follow-up migration
-- 20260705150000 for the bug this avoids.

-- read an object when the parent experiment is readable (lab-shared, non-deleted,
-- or your own soft-deleted row)
create policy "experiment_files_obj_read" on storage.objects
  for select to authenticated using (
    bucket_id = 'experiment-files'
    and (storage.foldername(name))[1] in (
      select e.id from public.experiments e
      where e.deleted_at is null or e.owner_id = auth.uid()
    )
  );

-- create / overwrite / delete objects only for experiments you own
create policy "experiment_files_obj_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'experiment-files'
    and (storage.foldername(name))[1] in (
      select e.id from public.experiments e where e.owner_id = auth.uid()
    )
  );

create policy "experiment_files_obj_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'experiment-files'
    and (storage.foldername(name))[1] in (
      select e.id from public.experiments e where e.owner_id = auth.uid()
    )
  );

create policy "experiment_files_obj_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'experiment-files'
    and (storage.foldername(name))[1] in (
      select e.id from public.experiments e where e.owner_id = auth.uid()
    )
  );
