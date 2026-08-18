-- Bug fix (2026-08-18): self-serve workspace creation was broken outright.
--
-- Creating a workspace failed with 42501, "new row violates row-level
-- security policy for table workspaces", from createWorkspaceAction. T2.1
-- shipped self-serve workspace creation and it cannot currently be done at
-- all -- which is how a second lab would onboard, so it matters far more the
-- moment real users arrive than it did while only one workspace existed.
--
-- The cause is a chicken-and-egg between two policies that are each correct
-- in isolation:
--
--   workspaces_insert  with check (created_by = auth.uid())
--   workspaces_read    using      (is_workspace_member(id, auth.uid()))
--
-- lib/workspaces/service.ts inserts the workspace and reads the new id back
-- (`.insert(...).select("id")`), and only THEN inserts the workspace_members
-- row that makes the creator a member. At the moment of the insert the
-- creator is not yet a member of the workspace they are creating, so the row
-- they have just written is invisible to them.
--
-- Doing this as one security-definer function rather than loosening the read
-- policy, for two reasons. It does not depend on exactly how Postgres
-- reports a RETURNING clause blocked by a SELECT policy, so it holds
-- whichever way that behaves. And it makes the pair atomic: the two inserts
-- were separate statements, so a failure on the second left an orphan
-- workspace with no members, which therefore nobody could see or delete.
--
-- Still authenticated-only: auth.uid() must be present, and the caller is
-- always made the owner of what they create, so this grants nobody the
-- ability to write a row on someone else's behalf.
create or replace function create_workspace_with_owner(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'insufficient_privilege';
  end if;

  if v_name = '' then
    raise exception 'Enter a workspace name.' using errcode = 'check_violation';
  end if;

  insert into workspaces (name, created_by) values (v_name, v_uid) returning id into v_id;
  insert into workspace_members (workspace_id, user_id, role) values (v_id, v_uid, 'owner');

  return v_id;
end;
$$;
