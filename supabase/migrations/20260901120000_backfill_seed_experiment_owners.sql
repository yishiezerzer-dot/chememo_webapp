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
-- Amended 2026-09-08, before this ever ran anywhere but chememo-dev. An RLS
-- review of the promotion found three triggers fire on this UPDATE that the
-- original did not account for, and the first of them can abort the whole
-- `db push` against production:
--
--   * experiments_enforce_lifecycle (BEFORE UPDATE) rejects any change to a
--     LOCKED row whose diff touches a column outside
--     {status, locked_at, updated_at, reviewed_at, reviewed_by, short_code}.
--     owner_id is not in that list. So a single completed/reviewed/archived
--     row among the ownerless twelve raises check_violation and takes the
--     entire migration down with it. The dev verification quoted above
--     checked owner_id and soft-delete, NOT locked_at -- and CI can never
--     catch this, because the auth.users guard makes the whole block a no-op
--     on a fresh database.
--   * experiments_record_revision (AFTER UPDATE) would write twelve revision
--     rows with editor_id = auth.uid(), which is null during `db push`,
--     putting an unattributed edit into the history of every seed record --
--     permanent noise in the audit trail of a lab notebook.
--   * experiments_enqueue_index_job (AFTER UPDATE) would reset all twelve
--     index_jobs rows to pending and re-embed them on the next deploy.
--     owner_id is not part of the embedded content, so that is paid API calls
--     for an identical vector.
--
-- T2.1's backfill of this same table hit the first two and bracketed itself
-- the same way (20260809120000_workspace_role_model.sql:180-189, with a
-- comment saying why). This mirrors that, and adds the index-job trigger.
do $$
begin
  if exists (select 1 from auth.users where id = 'cd102d14-5624-49e6-9e1f-ab5c7a2d8022') then
    alter table experiments disable trigger experiments_enforce_lifecycle;
    alter table experiments disable trigger experiments_record_revision;
    alter table experiments disable trigger experiments_enqueue_index_job;

    update experiments
    set owner_id = 'cd102d14-5624-49e6-9e1f-ab5c7a2d8022'
    where owner_id is null;

    alter table experiments enable trigger experiments_enforce_lifecycle;
    alter table experiments enable trigger experiments_record_revision;
    alter table experiments enable trigger experiments_enqueue_index_job;
  end if;
end $$;
