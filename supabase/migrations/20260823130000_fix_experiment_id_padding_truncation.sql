-- Real root cause of the 23505 unique-violation storm on experiments_pkey
-- (not a sequence-value drift — the earlier 20260823120000 resync migration
-- didn't fix it, because the actual bug is this function's formatting):
-- Postgres's lpad(string, length) TRUNCATES on the right when the input is
-- already longer than `length`, it does not just skip padding. Once
-- experiment_id_seq passed 999, lpad(n::text, 3, '0') started truncating
-- every 4-digit number down to its first 3 characters — 1000..1009 all
-- collapsed to "100", which already existed as EXP-100, so every creation
-- failed with a duplicate-key error. Fixed by only padding up to the
-- number's own length when that's already >= 3, so ids below 1000 are
-- byte-for-byte unchanged (EXP-001, EXP-042, EXP-999) and ids at or above
-- 1000 are left at their full width (EXP-1000, EXP-1001, ...) instead of
-- being cut down.
create or replace function next_experiment_id()
returns text
language plpgsql
as $$
declare
  n bigint := nextval('experiment_id_seq');
begin
  return 'EXP-' || lpad(n::text, greatest(3, length(n::text)), '0');
end;
$$;
