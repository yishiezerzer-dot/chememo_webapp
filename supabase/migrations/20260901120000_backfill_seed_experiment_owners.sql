-- Backfill the 12 seed experiments (EXP-001..EXP-012), which were created
-- before per-user ownership existed and have carried owner_id = null ever
-- since. Because `isOwner` is false for a null owner, the most realistic
-- records in the notebook show no Edit button, no lifecycle controls and no
-- AI suggestions panel to any user -- and RLS would reject those writes
-- anyway. It also blocks file uploads: the storage insert policy in
-- 20260705140000 requires the parent experiment's owner_id = auth.uid(), so
-- attaching a file to any of the twelve fails outright.
--
-- Same fix, same account, same guard as T0.11 used for the ownerless seed
-- *projects* (20260728120000). The guard matters: CI's `rls` job builds a
-- brand-new local Supabase instance from this migration history and has no
-- auth.users rows at all, so a bare UPDATE would violate owner_id's foreign
-- key and abort the whole apply.
--
-- Verified against chememo-dev before writing this: exactly 12 rows have a
-- null owner_id, they are precisely EXP-001..EXP-012, and none is
-- soft-deleted -- so `where owner_id is null` is exact here, not a broad
-- sweep. EXP-013 already belongs to this same account.
do $$
begin
  if exists (select 1 from auth.users where id = 'cd102d14-5624-49e6-9e1f-ab5c7a2d8022') then
    update experiments
    set owner_id = 'cd102d14-5624-49e6-9e1f-ab5c7a2d8022'
    where owner_id is null;
  end if;
end $$;
