-- Audit follow-up — user-managed projects. Projects were read-only reference
-- data (4 hardcoded seed rows); this lets lab members create their own and
-- delete ones they created. Seed rows keep owner_id = null ("ownerless"), so
-- anyone can clean them up through the same delete path once the UI ships.

alter table projects add column owner_id uuid references auth.users(id);

-- Deleting a project must not be blocked by soft-deleted experiments that
-- still reference it (the app-level delete check only looks at *active*
-- experiments). Look up the FK's actual name rather than hardcoding it, since
-- Postgres auto-generates it and we don't want a migration that silently
-- no-ops if the name ever differs from what we guessed.
do $$
declare
  fkname text;
begin
  select tc.constraint_name into fkname
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'experiments'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'project';

  if fkname is not null then
    execute format('alter table experiments drop constraint %I', fkname);
  end if;

  alter table experiments
    add constraint experiments_project_fkey
    foreign key (project) references projects(id) on delete set null;
end $$;

create policy projects_insert_own on projects
  for insert to authenticated with check (owner_id = auth.uid());

create policy projects_delete_own on projects
  for delete to authenticated using (owner_id = auth.uid() or owner_id is null);
