-- T1.3 — autosave / draft recovery / conflict detection.
-- See Spec: ChemMemo_Feature_AutosaveDraftRecovery_Spec.md (D1-D4).

-- Owner-only (D1-D3): the first table in this schema that is NOT lab-shared —
-- a draft is private scratch space, not yet a scientific record.
create table experiment_drafts (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  target_experiment_id  text references experiments(id) on delete cascade,
  client_draft_id       text,
  fields                jsonb not null default '{}',
  raw_note              text,
  base_updated_at       timestamptz,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  constraint experiment_drafts_one_key check (
    (target_experiment_id is not null and client_draft_id is null)
    or (target_experiment_id is null and client_draft_id is not null)
  )
);

-- One draft per (user, target) — an upsert target, not a growing log.
create unique index experiment_drafts_owner_target_uidx
  on experiment_drafts (owner_id, target_experiment_id)
  where target_experiment_id is not null;
create unique index experiment_drafts_owner_client_uidx
  on experiment_drafts (owner_id, client_draft_id)
  where client_draft_id is not null;

alter table experiment_drafts enable row level security;

create policy experiment_drafts_own on experiment_drafts
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
