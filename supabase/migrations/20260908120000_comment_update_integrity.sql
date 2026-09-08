-- Comments were rewritable by anyone in the workspace.
--
-- comments_update (20260809120000, T2.1's RLS rewrite) is:
--
--   using       (is_workspace_writer(workspace_id, auth.uid()))
--   with check  (is_workspace_writer(workspace_id, auth.uid()))
--
-- Neither clause mentions created_by, body, target_id or resolved_by. The
-- service layer only ever writes resolved_at/resolved_by (lib/comments/
-- service.ts), but PostgREST is reachable from the browser with the user's own
-- JWT, so the policy is the only limit that exists. Any workspace writer could
-- PATCH /rest/v1/comments?id=eq.<x> and rewrite the body of another
-- scientist's comment while leaving created_by intact, or reassign created_by
-- outright.
--
-- It does not stop at the comment. trg_evidence_chunk_comment
-- (20260818120000) fires on UPDATE as well as INSERT and routes through
-- upsert_evidence_chunk, which is security definer -- so the rewritten text is
-- re-embedded and comes back in RAG answers, workspace-wide, still attributed
-- to the original author. For a lab notebook whose whole worth is that the
-- screen matches the record, a silently rewritable comment attributed to
-- someone else is the worst shape of bug this codebase has.
--
-- Two smaller holes in the same policy, fixed here too:
--
--   * resolved_by was writable to any value, so a writer could mark a comment
--     resolved AS SOMEONE ELSE -- a forged sign-off on the table that records
--     review. experiment_lock_events_insert (20260730120000) already sets the
--     precedent: actor_id = auth.uid().
--   * workspace_id was writable, and trg_workspace_comments is BEFORE INSERT
--     only, so nothing re-derives it from target_id afterwards. A member of
--     two workspaces could desynchronise a comment's workspace_id from its
--     target's. (with check keeps them from moving it somewhere they are not
--     a writer, so this leaks nothing -- it just makes the row incoherent.)
--
-- Why a trigger and not a policy: RLS with check cannot see OLD, so "this
-- column did not change" is inexpressible as a policy. The codebase already
-- enforces this kind of invariant with triggers (experiments_enforce_lifecycle,
-- experiments_freeze_protocol_version), and this follows them.
--
-- What deliberately still works: ANY workspace member can resolve or reopen
-- ANY comment, including one they did not write. That is D7's intent and the
-- existing RLS suite asserts it. Only the *attribution* is constrained.

create or replace function enforce_comment_update_rules() returns trigger
language plpgsql as $$
begin
  -- Identity, authorship and target are fixed at insert time. workspace_id is
  -- included because its trigger never re-runs on update.
  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.target_type is distinct from old.target_type
     or new.target_id is distinct from old.target_id
     or new.workspace_id is distinct from old.workspace_id then
    raise exception 'A comment''s identity, author and target cannot be changed.'
      using errcode = '42501';
  end if;

  -- Editing the text is the author's alone.
  if new.body is distinct from old.body and old.created_by is distinct from auth.uid() then
    raise exception 'Only a comment''s author can edit its body.'
      using errcode = '42501';
  end if;

  -- Resolving is anyone's; resolving AS someone else is nobody's. Checked only
  -- when it changes, so the author editing an already-resolved comment does
  -- not trip over a resolved_by that was legitimately set by someone else.
  if new.resolved_by is distinct from old.resolved_by
     and new.resolved_by is not null
     and new.resolved_by is distinct from auth.uid() then
    raise exception 'A comment can only be resolved as yourself.'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists comments_enforce_update on comments;
create trigger comments_enforce_update
  before update on comments
  for each row execute function enforce_comment_update_rules();
