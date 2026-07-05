-- Fix: in the previous storage policies, `storage.foldername(name)` sat inside
-- `select 1 from experiments e`, where unqualified `name` bound to
-- experiments.name (the experiment title) instead of the storage object's path
-- — so the check never matched and every upload was denied. Rewrite so the
-- object path is evaluated at the outer level (no shadowing) and matched against
-- the set of experiment ids via IN.

drop policy if exists "experiment_files_obj_read" on storage.objects;
drop policy if exists "experiment_files_obj_insert" on storage.objects;
drop policy if exists "experiment_files_obj_update" on storage.objects;
drop policy if exists "experiment_files_obj_delete" on storage.objects;

create policy "experiment_files_obj_read" on storage.objects
  for select to authenticated using (
    bucket_id = 'experiment-files'
    and (storage.foldername(name))[1] in (
      select e.id from public.experiments e
      where e.deleted_at is null or e.owner_id = auth.uid()
    )
  );

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
