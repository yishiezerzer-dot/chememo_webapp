-- Steps and files of a soft-deleted experiment stayed readable to everyone in
-- the workspace, and are now commentable.
--
-- experiments_read carries `and (deleted_at is null or owner_id = auth.uid())`
-- (20260809120000:478). experiment_files_read (:493) and experiment_steps_read
-- (:620) are bare `is_workspace_member(workspace_id, auth.uid())` with no such
-- term. The line above experiment_files_read still says "existing policy checks
-- parent experiment readability/ownership already" -- true of the pre-T2.1
-- policy, and quietly untrue of the rewrite that replaced it. The comment
-- outlived the property it described.
--
-- What that allows today: a member soft-deletes their draft, and every other
-- member can still enumerate its experiment_steps and experiment_files rows
-- over PostgREST. Since 2026-09-07 those two ids are also comment targets that
-- the client passes directly, so comments can be attached to the steps and
-- files of a deleted record -- and comment bodies are embedded into
-- evidence_chunks by trg_evidence_chunk_comment, which makes them
-- RAG-retrievable workspace-wide. Storage bytes were never exposed:
-- experiment_files_obj_read (20260705140000:18-25) does honour soft-delete.
--
-- Scope is limited to drafts, because lifecycle clause a2 forbids soft-deleting
-- anything past `draft`.
--
-- The fix leans on RLS rather than restating the rule. A policy expression is
-- evaluated with the caller's own privileges, so the subquery below is itself
-- filtered by experiments_read: a soft-deleted parent is simply not visible to
-- a non-owner, the `exists` fails, and the child row disappears with it. The
-- owner keeps seeing their own soft-deleted record's children, which is what
-- makes restore work. No recursion risk -- experiments_read does not reference
-- either of these tables.
--
-- Not changed, deliberately: step_observations and step_deviations have the
-- same shape of gap one level further down, but neither is a comment target,
-- so neither has the evidence-chunk path that makes this worth the extra join.
-- Worth revisiting if they ever become commentable.

drop policy if exists experiment_files_read on experiment_files;
create policy experiment_files_read on experiment_files for select to authenticated
  using (
    is_workspace_member(workspace_id, auth.uid())
    and exists (select 1 from experiments e where e.id = experiment_files.experiment_id)
  );

drop policy if exists experiment_steps_read on experiment_steps;
create policy experiment_steps_read on experiment_steps for select to authenticated
  using (
    is_workspace_member(workspace_id, auth.uid())
    and exists (select 1 from experiments e where e.id = experiment_steps.experiment_id)
  );

-- comment_mentions accepted a workspace_id chosen by the client.
--
-- set_workspace_from_comment_id() (20260809120000:338) only derives the
-- workspace when the client left it null, and comment_mentions_insert (:525)
-- then checks is_workspace_writer against whatever was supplied. A member of
-- two workspaces could file a mention for their own workspace-A comment while
-- labelling the row workspace B: readable to B's members, invisible to A's.
--
-- The sibling trigger for comments (set_workspace_from_target) assigns
-- unconditionally and is the reason that table is not exploitable the same
-- way -- but it carries no comment saying so, so it reads like an oversight
-- rather than the load-bearing line it is. Both are now unconditional and both
-- say why, because the next person to tidy this family of triggers into a
-- consistent shape would otherwise "fix" the one that is right.
create or replace function set_workspace_from_comment_id() returns trigger language plpgsql as $$
begin
  -- Unconditional, NOT `if new.workspace_id is null`: the client supplies this
  -- column on a PostgREST insert, and deriving it from the parent comment is
  -- the only way it can be trusted.
  select workspace_id into new.workspace_id from comments where id = new.comment_id;
  return new;
end;
$$;
