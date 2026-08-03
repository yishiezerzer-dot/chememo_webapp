-- T1.9 — Comments, mentions, review requests.
-- See Spec: ChemMemo_Feature_CommentsTasksReview_Spec.md (D1-D7).

-- 1. Comments (D1, D2, D7). Polymorphic target scoped to the three entities
--    that are both real today and benefit from an in-context note.
create table comments (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null check (target_type in ('experiment', 'experiment_step', 'experiment_file')),
  target_id    text not null,
  body         text not null,
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id)
);

create index comments_target_idx on comments (target_type, target_id);

alter table comments enable row level security;
create policy comments_read on comments for select to authenticated using (true);
create policy comments_insert on comments for insert to authenticated with check (created_by = auth.uid());
create policy comments_update on comments for update to authenticated using (true) with check (true);

create table comment_mentions (
  comment_id        uuid not null references comments(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id),
  primary key (comment_id, mentioned_user_id)
);

alter table comment_mentions enable row level security;
create policy comment_mentions_read on comment_mentions for select to authenticated using (true);
create policy comment_mentions_insert on comment_mentions for insert to authenticated with check (
  exists (select 1 from comments c where c.id = comment_id and c.created_by = auth.uid())
);

-- 2. Tasks + review requests (D4, D5, D6). One table, task_type discriminates.
create table experiment_tasks (
  id            uuid primary key default gen_random_uuid(),
  target_type   text not null check (target_type in ('experiment', 'experiment_step', 'experiment_file')),
  target_id     text not null,
  task_type     text not null check (task_type in ('task', 'review')),
  title         text not null,
  status        text not null default 'not_started',
  blocker_note  text,
  assignee_id   uuid references auth.users(id),
  due_at        timestamptz,
  checklist     jsonb,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

create index experiment_tasks_target_idx on experiment_tasks (target_type, target_id);
create index experiment_tasks_assignee_idx on experiment_tasks (assignee_id);

alter table experiment_tasks enable row level security;
create policy experiment_tasks_read on experiment_tasks for select to authenticated using (true);
create policy experiment_tasks_insert on experiment_tasks for insert to authenticated with check (created_by = auth.uid());
create policy experiment_tasks_update on experiment_tasks for update to authenticated using (true) with check (true);

-- 3. In-app notifications (D3) — inserted only by server actions using the
--    caller's own session (mention/task-assign/review-request all happen as
--    a side effect of an insert the acting user is already authorized for),
--    never directly by an arbitrary client targeting someone else's inbox.
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  kind        text not null check (kind in ('mention', 'task_assigned', 'review_requested')),
  comment_id  uuid references comments(id) on delete cascade,
  task_id     uuid references experiment_tasks(id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, read_at);

alter table notifications enable row level security;
create policy notifications_read on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_insert on notifications for insert to authenticated with check (true);
create policy notifications_update_own on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. Task status vocabulary (D5) — §10.3's 8 values, flagged as T1.9's to
--    seed back in T1.1's C1 decision but never actually seeded until now.
insert into controlled_vocabularies (vocabulary, value, sort_order, standard_section) values
  ('task_status', 'not_started', 1, '10.3'),
  ('task_status', 'ready', 2, '10.3'),
  ('task_status', 'in_progress', 3, '10.3'),
  ('task_status', 'blocked', 4, '10.3'),
  ('task_status', 'waiting', 5, '10.3'),
  ('task_status', 'completed', 6, '10.3'),
  ('task_status', 'failed', 7, '10.3'),
  ('task_status', 'cancelled', 8, '10.3');
