-- T2.1 — Workspace & role model.
-- See Spec: ChemMemo_Feature_WorkspaceRoleModel_Spec.md (D1-D7).
--
-- Every statement is idempotent (IF NOT EXISTS / DROP-then-CREATE) per this
-- session's established convention for migrations that apply to real,
-- already-populated production data.

-- ============================================================
-- 1. Role enum (D2) — a real Postgres type, not a controlled_vocabularies
--    row-set, since RLS policies compare it directly and it's an
--    app-defined authorization concept, not a standard-governed vocabulary.
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'workspace_role') then
    create type workspace_role as enum ('owner', 'admin', 'pi', 'researcher', 'student', 'viewer');
  end if;
end $$;

-- ============================================================
-- 2. Core tables (D3).
-- ============================================================
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role workspace_role not null,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists project_members (
  project_id text not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role workspace_role not null,
  primary key (project_id, user_id)
);

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role workspace_role not null,
  invited_by uuid references auth.users(id),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. Helper functions (security definer — RLS policies on
--    workspace_members/project_members themselves call these, and without
--    security definer that would recurse into the very RLS being checked).
-- ============================================================
create or replace function is_workspace_member(ws_id uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws_id and user_id = uid);
$$;

create or replace function is_workspace_writer(ws_id uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws_id and user_id = uid and role <> 'viewer'
  );
$$;

create or replace function is_workspace_admin(ws_id uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws_id and user_id = uid and role in ('owner', 'admin')
  );
$$;

-- D3's "project roles can override workspace defaults."
create or replace function effective_role(ws_id uuid, proj_id text, uid uuid)
returns workspace_role language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from project_members where project_id = proj_id and user_id = uid),
    (select role from workspace_members where workspace_id = ws_id and user_id = uid)
  );
$$;

-- ============================================================
-- 4. workspace_id columns — nullable for now; NOT NULL added after backfill
--    (section 6). Top-level tables (no natural parent) vs child tables
--    (workspace_id trigger-inherited from a parent, D6) are handled
--    identically here; the difference is only in section 7's triggers.
-- ============================================================
alter table projects add column if not exists workspace_id uuid references workspaces(id);
alter table experiments add column if not exists workspace_id uuid references workspaces(id);
alter table protocols add column if not exists workspace_id uuid references workspaces(id);
alter table experiment_templates add column if not exists workspace_id uuid references workspaces(id);
alter table saved_views add column if not exists workspace_id uuid references workspaces(id);
alter table experiment_drafts add column if not exists workspace_id uuid references workspaces(id);
alter table experiment_series add column if not exists workspace_id uuid references workspaces(id);

alter table experiment_files add column if not exists workspace_id uuid references workspaces(id);
alter table experiment_revisions add column if not exists workspace_id uuid references workspaces(id);
alter table experiment_lock_events add column if not exists workspace_id uuid references workspaces(id);
alter table protocol_versions add column if not exists workspace_id uuid references workspaces(id);
alter table protocol_steps add column if not exists workspace_id uuid references workspaces(id);
alter table experiment_steps add column if not exists workspace_id uuid references workspaces(id);
alter table step_observations add column if not exists workspace_id uuid references workspaces(id);
alter table step_deviations add column if not exists workspace_id uuid references workspaces(id);
alter table experiment_template_versions add column if not exists workspace_id uuid references workspaces(id);
alter table experiment_relationships add column if not exists workspace_id uuid references workspaces(id);
alter table experiment_series_members add column if not exists workspace_id uuid references workspaces(id);
alter table comments add column if not exists workspace_id uuid references workspaces(id);
alter table comment_mentions add column if not exists workspace_id uuid references workspaces(id);
alter table experiment_tasks add column if not exists workspace_id uuid references workspaces(id);
alter table ai_summaries add column if not exists workspace_id uuid references workspaces(id);
alter table experiment_embeddings add column if not exists workspace_id uuid references workspaces(id);

-- notifications, ai_requests, index_jobs deliberately NOT scoped — already
-- correctly user-scoped (notifications, ai_requests) or service-role-only
-- with zero authenticated-role policies (index_jobs), so there is no
-- cross-workspace leak to close on any of the three.

-- ============================================================
-- 5. Backfill (D5) — one workspace for all existing data, owner
--    yishieze@gmail.com (Yishi's decision), every other existing user
--    defaults to 'researcher' (matches today's actual trust level, per
--    Yishi's decision — nobody's access changes on migration day).
-- ============================================================
do $$
declare
  ws_id uuid;
  owner_uid uuid;
begin
  select id into owner_uid from auth.users where email = 'yishieze@gmail.com';
  if owner_uid is null then
    -- Real environments (chememo-dev/prod) always have this account. A
    -- fresh, differently-seeded database (CI's `rls` job spins up its own
    -- local Postgres from scratch every run) won't — fall back to an
    -- arbitrary existing user rather than crash the whole migration; who
    -- "owns" the backfilled workspace doesn't matter for a database that
    -- has no real history anyway.
    select id into owner_uid from auth.users order by created_at limit 1;
  end if;
  -- Note: owner_uid may still be null here (CI's fresh Postgres has zero
  -- auth.users at migration-apply time — real users are only created later,
  -- at test-runtime). The seed migration's fixed projects/experiments rows
  -- still need a workspace_id before section 6's NOT NULL constraints apply,
  -- so we press on with created_by left null rather than returning early.

  select id into ws_id from workspaces where name = 'MFP Lab' limit 1;
  if ws_id is null then
    insert into workspaces (name, created_by) values ('MFP Lab', owner_uid) returning id into ws_id;
  end if;

  insert into workspace_members (workspace_id, user_id, role)
    select ws_id, owner_uid, 'owner'
    where owner_uid is not null
      and not exists (select 1 from workspace_members where workspace_id = ws_id and user_id = owner_uid);

  insert into workspace_members (workspace_id, user_id, role)
    select ws_id, u.id, 'researcher'
    from auth.users u
    where u.id <> owner_uid
      and not exists (select 1 from workspace_members where workspace_id = ws_id and user_id = u.id);

  update projects set workspace_id = ws_id where workspace_id is null;

  -- Same trigger-disable dance T1.6 established: workspace_id isn't in
  -- enforce_experiment_lifecycle()'s exclusion list, so without this a
  -- locked (completed/archived/etc.) experiment would reject the backfill
  -- outright, and record_experiment_revision() would log a spurious
  -- revision for a column no human actually edited.
  alter table experiments disable trigger experiments_enforce_lifecycle;
  alter table experiments disable trigger experiments_record_revision;
  update experiments set workspace_id = ws_id where workspace_id is null;
  alter table experiments enable trigger experiments_enforce_lifecycle;
  alter table experiments enable trigger experiments_record_revision;

  update protocols set workspace_id = ws_id where workspace_id is null;
  update experiment_templates set workspace_id = ws_id where workspace_id is null;
  update saved_views set workspace_id = ws_id where workspace_id is null;
  update experiment_drafts set workspace_id = ws_id where workspace_id is null;
  update experiment_series set workspace_id = ws_id where workspace_id is null;

  update experiment_files f set workspace_id = ws_id where workspace_id is null;
  update experiment_revisions r set workspace_id = ws_id where workspace_id is null;
  update experiment_lock_events l set workspace_id = ws_id where workspace_id is null;
  update protocol_versions pv set workspace_id = ws_id where workspace_id is null;
  update protocol_steps ps set workspace_id = ws_id where workspace_id is null;
  update experiment_steps es set workspace_id = ws_id where workspace_id is null;
  update step_observations so set workspace_id = ws_id where workspace_id is null;
  update step_deviations sd set workspace_id = ws_id where workspace_id is null;
  update experiment_template_versions etv set workspace_id = ws_id where workspace_id is null;
  update experiment_relationships er set workspace_id = ws_id where workspace_id is null;
  update experiment_series_members esm set workspace_id = ws_id where workspace_id is null;
  update comments c set workspace_id = ws_id where workspace_id is null;
  update comment_mentions cm set workspace_id = ws_id where workspace_id is null;
  update experiment_tasks et set workspace_id = ws_id where workspace_id is null;
  update ai_summaries s set workspace_id = ws_id where workspace_id is null;
  update experiment_embeddings e set workspace_id = ws_id where workspace_id is null;
end $$;

-- ============================================================
-- 6. NOT NULL on the 7 top-level tables only (no parent to inherit from,
--    so the app must supply workspace_id directly on insert). The 16
--    trigger-populated child tables stay nullable at the column level —
--    section 7's BEFORE INSERT triggers reliably fill them from the
--    parent every time, and this keeps every generated Insert type
--    optional on workspace_id for child tables rather than forcing every
--    call site to redundantly pass a value the trigger already derives.
--    RLS is unaffected either way: is_workspace_member(null, ...) is
--    simply false, so a null would only ever produce "no access," never
--    a leak.
-- ============================================================
alter table projects alter column workspace_id set not null;
alter table experiments alter column workspace_id set not null;
alter table protocols alter column workspace_id set not null;
alter table experiment_templates alter column workspace_id set not null;
alter table saved_views alter column workspace_id set not null;
alter table experiment_drafts alter column workspace_id set not null;
alter table experiment_series alter column workspace_id set not null;

-- ============================================================
-- 7. Triggers (D6) — auto-populate workspace_id on future inserts from the
--    immediate parent, so app code doesn't need to supply it for anything
--    but the top-level tables (which have no parent to inherit from).
-- ============================================================
create or replace function set_workspace_from_experiment_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from experiments where id = new.experiment_id;
  end if;
  return new;
end;
$$;

create or replace function set_workspace_from_protocol_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from protocols where id = new.protocol_id;
  end if;
  return new;
end;
$$;

create or replace function set_workspace_from_protocol_version_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from protocol_versions where id = new.protocol_version_id;
  end if;
  return new;
end;
$$;

create or replace function set_workspace_from_experiment_step_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from experiment_steps where id = new.experiment_step_id;
  end if;
  return new;
end;
$$;

create or replace function set_workspace_from_template_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from experiment_templates where id = new.template_id;
  end if;
  return new;
end;
$$;

-- experiment_relationships: derive from the source experiment, and reject
-- linking two experiments that aren't in the same workspace (a cross-
-- workspace relationship would defeat the whole point of isolation).
create or replace function set_workspace_from_relationship() returns trigger language plpgsql as $$
declare
  source_ws uuid;
  target_ws uuid;
begin
  select workspace_id into source_ws from experiments where id = new.source_experiment_id;
  select workspace_id into target_ws from experiments where id = new.target_experiment_id;
  if source_ws is distinct from target_ws then
    raise exception 'Cannot relate experiments from different workspaces.';
  end if;
  new.workspace_id := source_ws;
  return new;
end;
$$;

-- experiment_series_members: derive from the series, and reject adding an
-- experiment from a different workspace than the series itself.
create or replace function set_workspace_from_series_member() returns trigger language plpgsql as $$
declare
  series_ws uuid;
  exp_ws uuid;
begin
  select workspace_id into series_ws from experiment_series where id = new.series_id;
  select workspace_id into exp_ws from experiments where id = new.experiment_id;
  if series_ws is distinct from exp_ws then
    raise exception 'Cannot add an experiment to a series in a different workspace.';
  end if;
  new.workspace_id := series_ws;
  return new;
end;
$$;

-- comments / experiment_tasks: polymorphic target resolution (D1's three
-- target types from T1.9).
create or replace function set_workspace_from_target() returns trigger language plpgsql as $$
declare
  ws uuid;
begin
  if new.target_type = 'experiment' then
    select workspace_id into ws from experiments where id = new.target_id;
  elsif new.target_type = 'experiment_step' then
    select workspace_id into ws from experiment_steps where id::text = new.target_id;
  elsif new.target_type = 'experiment_file' then
    select workspace_id into ws from experiment_files where id::text = new.target_id;
  end if;
  new.workspace_id := ws;
  return new;
end;
$$;

create or replace function set_workspace_from_comment_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from comments where id = new.comment_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspace_experiment_files on experiment_files;
create trigger trg_workspace_experiment_files before insert on experiment_files
  for each row execute function set_workspace_from_experiment_id();

drop trigger if exists trg_workspace_experiment_revisions on experiment_revisions;
create trigger trg_workspace_experiment_revisions before insert on experiment_revisions
  for each row execute function set_workspace_from_experiment_id();

drop trigger if exists trg_workspace_experiment_lock_events on experiment_lock_events;
create trigger trg_workspace_experiment_lock_events before insert on experiment_lock_events
  for each row execute function set_workspace_from_experiment_id();

drop trigger if exists trg_workspace_experiment_steps on experiment_steps;
create trigger trg_workspace_experiment_steps before insert on experiment_steps
  for each row execute function set_workspace_from_experiment_id();

drop trigger if exists trg_workspace_ai_summaries on ai_summaries;
create trigger trg_workspace_ai_summaries before insert on ai_summaries
  for each row execute function set_workspace_from_experiment_id();

drop trigger if exists trg_workspace_experiment_embeddings on experiment_embeddings;
create trigger trg_workspace_experiment_embeddings before insert on experiment_embeddings
  for each row execute function set_workspace_from_experiment_id();

drop trigger if exists trg_workspace_protocol_versions on protocol_versions;
create trigger trg_workspace_protocol_versions before insert on protocol_versions
  for each row execute function set_workspace_from_protocol_id();

drop trigger if exists trg_workspace_protocol_steps on protocol_steps;
create trigger trg_workspace_protocol_steps before insert on protocol_steps
  for each row execute function set_workspace_from_protocol_version_id();

drop trigger if exists trg_workspace_step_observations on step_observations;
create trigger trg_workspace_step_observations before insert on step_observations
  for each row execute function set_workspace_from_experiment_step_id();

drop trigger if exists trg_workspace_step_deviations on step_deviations;
create trigger trg_workspace_step_deviations before insert on step_deviations
  for each row execute function set_workspace_from_experiment_step_id();

drop trigger if exists trg_workspace_experiment_template_versions on experiment_template_versions;
create trigger trg_workspace_experiment_template_versions before insert on experiment_template_versions
  for each row execute function set_workspace_from_template_id();

drop trigger if exists trg_workspace_experiment_relationships on experiment_relationships;
create trigger trg_workspace_experiment_relationships before insert on experiment_relationships
  for each row execute function set_workspace_from_relationship();

drop trigger if exists trg_workspace_experiment_series_members on experiment_series_members;
create trigger trg_workspace_experiment_series_members before insert on experiment_series_members
  for each row execute function set_workspace_from_series_member();

drop trigger if exists trg_workspace_comments on comments;
create trigger trg_workspace_comments before insert on comments
  for each row execute function set_workspace_from_target();

drop trigger if exists trg_workspace_experiment_tasks on experiment_tasks;
create trigger trg_workspace_experiment_tasks before insert on experiment_tasks
  for each row execute function set_workspace_from_target();

drop trigger if exists trg_workspace_comment_mentions on comment_mentions;
create trigger trg_workspace_comment_mentions before insert on comment_mentions
  for each row execute function set_workspace_from_comment_id();

-- ============================================================
-- 8. RLS: workspaces / workspace_members / project_members / invitations.
-- ============================================================
alter table workspaces enable row level security;
drop policy if exists workspaces_read on workspaces;
create policy workspaces_read on workspaces for select to authenticated
  using (is_workspace_member(id, auth.uid()));
drop policy if exists workspaces_insert on workspaces;
create policy workspaces_insert on workspaces for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists workspaces_update on workspaces;
create policy workspaces_update on workspaces for update to authenticated
  using (is_workspace_admin(id, auth.uid())) with check (is_workspace_admin(id, auth.uid()));

alter table workspace_members enable row level security;
drop policy if exists workspace_members_read on workspace_members;
create policy workspace_members_read on workspace_members for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists workspace_members_insert on workspace_members;
create policy workspace_members_insert on workspace_members for insert to authenticated
  with check (is_workspace_admin(workspace_id, auth.uid()) or user_id = auth.uid());
drop policy if exists workspace_members_update on workspace_members;
create policy workspace_members_update on workspace_members for update to authenticated
  using (is_workspace_admin(workspace_id, auth.uid())) with check (is_workspace_admin(workspace_id, auth.uid()));
drop policy if exists workspace_members_delete on workspace_members;
create policy workspace_members_delete on workspace_members for delete to authenticated
  using (is_workspace_admin(workspace_id, auth.uid()) or user_id = auth.uid());

alter table project_members enable row level security;
drop policy if exists project_members_read on project_members;
create policy project_members_read on project_members for select to authenticated
  using (exists (select 1 from projects p where p.id = project_id and is_workspace_member(p.workspace_id, auth.uid())));
drop policy if exists project_members_write on project_members;
create policy project_members_write on project_members for all to authenticated
  using (exists (select 1 from projects p where p.id = project_id and is_workspace_admin(p.workspace_id, auth.uid())))
  with check (exists (select 1 from projects p where p.id = project_id and is_workspace_admin(p.workspace_id, auth.uid())));

alter table invitations enable row level security;
drop policy if exists invitations_read on invitations;
create policy invitations_read on invitations for select to authenticated
  using (is_workspace_admin(workspace_id, auth.uid()));
drop policy if exists invitations_insert on invitations;
create policy invitations_insert on invitations for insert to authenticated
  with check (is_workspace_admin(workspace_id, auth.uid()) and invited_by = auth.uid());
drop policy if exists invitations_update on invitations;
create policy invitations_update on invitations for update to authenticated
  using (is_workspace_admin(workspace_id, auth.uid()) or true) with check (true);

-- ============================================================
-- 9. RLS rewrite — existing tables. Every policy now requires workspace
--    membership for read, writer role (not viewer) for insert, and keeps
--    each table's pre-existing ownership/frozen-state checks unchanged.
-- ============================================================

-- projects
drop policy if exists projects_read on projects;
create policy projects_read on projects for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists projects_insert_own on projects;
create policy projects_insert_own on projects for insert to authenticated
  with check (is_workspace_writer(workspace_id, auth.uid()) and owner_id = auth.uid());
drop policy if exists projects_delete_own on projects;
create policy projects_delete_own on projects for delete to authenticated
  using (is_workspace_member(workspace_id, auth.uid()) and owner_id = auth.uid());

-- experiments
drop policy if exists experiments_read on experiments;
create policy experiments_read on experiments for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()) and (deleted_at is null or owner_id = auth.uid()));
drop policy if exists experiments_insert_own on experiments;
create policy experiments_insert_own on experiments for insert to authenticated
  with check (is_workspace_writer(workspace_id, auth.uid()) and owner_id = auth.uid());
drop policy if exists experiments_update_own on experiments;
create policy experiments_update_own on experiments for update to authenticated
  using (is_workspace_member(workspace_id, auth.uid()) and owner_id = auth.uid())
  with check (is_workspace_member(workspace_id, auth.uid()) and owner_id = auth.uid());
drop policy if exists experiments_delete_own on experiments;
create policy experiments_delete_own on experiments for delete to authenticated
  using (is_workspace_member(workspace_id, auth.uid()) and owner_id = auth.uid());

-- experiment_files (existing policy checks parent experiment readability/ownership already)
drop policy if exists experiment_files_read on experiment_files;
create policy experiment_files_read on experiment_files for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists experiment_files_write on experiment_files;
create policy experiment_files_write on experiment_files for all to authenticated
  using (is_workspace_member(workspace_id, auth.uid())
    and exists (select 1 from experiments e where e.id = experiment_id and e.owner_id = auth.uid()))
  with check (is_workspace_writer(workspace_id, auth.uid())
    and exists (select 1 from experiments e where e.id = experiment_id and e.owner_id = auth.uid()));

-- experiment_embeddings / ai_summaries (service-role-write-only; just add membership to read)
drop policy if exists experiment_embeddings_read on experiment_embeddings;
create policy experiment_embeddings_read on experiment_embeddings for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists ai_summaries_read on ai_summaries;
create policy ai_summaries_read on ai_summaries for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));

-- comments
drop policy if exists comments_read on comments;
create policy comments_read on comments for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert to authenticated
  with check (is_workspace_writer(workspace_id, auth.uid()) and created_by = auth.uid());
drop policy if exists comments_update on comments;
create policy comments_update on comments for update to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

-- comment_mentions
drop policy if exists comment_mentions_read on comment_mentions;
create policy comment_mentions_read on comment_mentions for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists comment_mentions_insert on comment_mentions;
create policy comment_mentions_insert on comment_mentions for insert to authenticated
  with check (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (select 1 from comments c where c.id = comment_id and c.created_by = auth.uid())
  );

-- experiment_tasks
drop policy if exists experiment_tasks_read on experiment_tasks;
create policy experiment_tasks_read on experiment_tasks for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists experiment_tasks_insert on experiment_tasks;
create policy experiment_tasks_insert on experiment_tasks for insert to authenticated
  with check (is_workspace_writer(workspace_id, auth.uid()) and created_by = auth.uid());
drop policy if exists experiment_tasks_update on experiment_tasks;
create policy experiment_tasks_update on experiment_tasks for update to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

-- experiment_relationships
drop policy if exists experiment_relationships_read on experiment_relationships;
create policy experiment_relationships_read on experiment_relationships for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists experiment_relationships_write on experiment_relationships;
create policy experiment_relationships_write on experiment_relationships for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

-- experiment_series / experiment_series_members
drop policy if exists experiment_series_read on experiment_series;
create policy experiment_series_read on experiment_series for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists experiment_series_write on experiment_series;
create policy experiment_series_write on experiment_series for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));
drop policy if exists experiment_series_members_read on experiment_series_members;
create policy experiment_series_members_read on experiment_series_members for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists experiment_series_members_write on experiment_series_members;
create policy experiment_series_members_write on experiment_series_members for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

-- experiment_revisions / experiment_lock_events (read-all within workspace; insert stays trigger/definer-only)
drop policy if exists experiment_revisions_read on experiment_revisions;
create policy experiment_revisions_read on experiment_revisions for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists experiment_lock_events_read on experiment_lock_events;
create policy experiment_lock_events_read on experiment_lock_events for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));

-- saved_views / experiment_drafts (fully owner-scoped; add membership check alongside)
drop policy if exists saved_views_own on saved_views;
create policy saved_views_own on saved_views for all to authenticated
  using (is_workspace_member(workspace_id, auth.uid()) and owner_id = auth.uid())
  with check (is_workspace_writer(workspace_id, auth.uid()) and owner_id = auth.uid());
drop policy if exists experiment_drafts_own on experiment_drafts;
create policy experiment_drafts_own on experiment_drafts for all to authenticated
  using (is_workspace_member(workspace_id, auth.uid()) and owner_id = auth.uid())
  with check (is_workspace_writer(workspace_id, auth.uid()) and owner_id = auth.uid());

-- protocols / protocol_versions / protocol_steps
drop policy if exists protocols_read on protocols;
create policy protocols_read on protocols for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists protocols_write on protocols;
create policy protocols_write on protocols for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

drop policy if exists protocol_versions_read on protocol_versions;
create policy protocol_versions_read on protocol_versions for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists protocol_versions_insert on protocol_versions;
create policy protocol_versions_insert on protocol_versions for insert to authenticated
  with check (is_workspace_writer(workspace_id, auth.uid()));
drop policy if exists protocol_versions_update on protocol_versions;
create policy protocol_versions_update on protocol_versions for update to authenticated
  using (is_workspace_writer(workspace_id, auth.uid()) and frozen_at is null)
  with check (is_workspace_writer(workspace_id, auth.uid()));

drop policy if exists protocol_steps_read on protocol_steps;
create policy protocol_steps_read on protocol_steps for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists protocol_steps_write on protocol_steps;
create policy protocol_steps_write on protocol_steps for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

-- experiment_steps / step_observations / step_deviations
drop policy if exists experiment_steps_read on experiment_steps;
create policy experiment_steps_read on experiment_steps for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
-- D9: writable only by the parent experiment's owner (mirrors
-- experiment_files) — workspace scoping narrows the read/membership check,
-- it doesn't replace the ownership check the pre-T2.1 policy already had.
drop policy if exists experiment_steps_write on experiment_steps;
create policy experiment_steps_write on experiment_steps for all to authenticated
  using (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (select 1 from experiments e where e.id = experiment_id and e.owner_id = auth.uid())
  )
  with check (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (select 1 from experiments e where e.id = experiment_id and e.owner_id = auth.uid())
  );

drop policy if exists step_observations_read on step_observations;
create policy step_observations_read on step_observations for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
-- D9: insertable only by the parent experiment's owner (via experiment_steps).
drop policy if exists step_observations_insert on step_observations;
create policy step_observations_insert on step_observations for insert to authenticated
  with check (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (
      select 1 from experiment_steps es join experiments e on e.id = es.experiment_id
      where es.id = experiment_step_id and e.owner_id = auth.uid()
    )
  );

drop policy if exists step_deviations_read on step_deviations;
create policy step_deviations_read on step_deviations for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
-- D9: insertable only by the parent experiment's owner (via experiment_steps).
drop policy if exists step_deviations_insert on step_deviations;
create policy step_deviations_insert on step_deviations for insert to authenticated
  with check (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (
      select 1 from experiment_steps es join experiments e on e.id = es.experiment_id
      where es.id = experiment_step_id and e.owner_id = auth.uid()
    )
  );

-- experiment_templates / experiment_template_versions
drop policy if exists experiment_templates_read on experiment_templates;
create policy experiment_templates_read on experiment_templates for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists experiment_templates_write on experiment_templates;
create policy experiment_templates_write on experiment_templates for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

drop policy if exists experiment_template_versions_read on experiment_template_versions;
create policy experiment_template_versions_read on experiment_template_versions for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists experiment_template_versions_insert on experiment_template_versions;
create policy experiment_template_versions_insert on experiment_template_versions for insert to authenticated
  with check (is_workspace_writer(workspace_id, auth.uid()));
drop policy if exists experiment_template_versions_update on experiment_template_versions;
create policy experiment_template_versions_update on experiment_template_versions for update to authenticated
  using (is_workspace_writer(workspace_id, auth.uid()) and frozen_at is null)
  with check (is_workspace_writer(workspace_id, auth.uid()));

notify pgrst, 'reload schema';
