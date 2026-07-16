-- Sprint S2 (audit P0) — atomic EXP-### IDs.
-- Replaces the read-max-plus-one generator (racy under concurrent creates) with
-- a Postgres sequence. next_experiment_id() hands out gap-free, collision-free
-- IDs like EXP-013. Seeds the sequence just past the current max EXP number so
-- existing rows are never reused.

do $$
declare max_num int;
begin
  select coalesce(max(cast(substring(id from 5) as int)), 0) into max_num
  from experiments where id ~ '^EXP-\d+$';
  execute format('create sequence if not exists experiment_id_seq start with %s', max_num + 1);
end $$;

create or replace function next_experiment_id()
returns text
language sql
as $$
  select 'EXP-' || lpad(nextval('experiment_id_seq')::text, 3, '0');
$$;

grant execute on function next_experiment_id() to authenticated;
