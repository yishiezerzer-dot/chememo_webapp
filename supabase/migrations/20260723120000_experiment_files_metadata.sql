-- T0.2 — server-side file & URL hardening: persist upload metadata so
-- integrity/provenance don't rely solely on the client-supplied label.
alter table experiment_files add column if not exists mime_type text;
alter table experiment_files add column if not exists byte_size bigint;
alter table experiment_files add column if not exists sha256 text;
alter table experiment_files add column if not exists uploaded_by uuid references auth.users(id);
