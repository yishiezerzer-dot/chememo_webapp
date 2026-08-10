-- Data-integrity fix, unrelated to T3.8's own schema changes: experiment_id_seq
-- (migration 20260716120000) had drifted behind the table's actual max
-- EXP-### id — some batch of rows was inserted with an explicit id that
-- bypassed next_experiment_id(), so the sequence never learned about it.
-- Symptom: next_experiment_id() started handing out ids that already existed,
-- failing every experiment creation with a 23505 unique-violation on
-- experiments_pkey. Same resync formula the original migration used to seed
-- the sequence, just re-applied against the table's CURRENT max id rather
-- than assuming it's already correct.
select setval(
  'experiment_id_seq',
  coalesce((select max(cast(substring(id from 5) as int)) from experiments where id ~ '^EXP-\d+$'), 0) + 1,
  false
);
