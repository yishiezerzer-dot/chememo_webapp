-- T1.4 — structured quantities & units.
-- See Spec: ChemMemo_Feature_StructuredQuantities_Spec.md (D1-D3).

-- D2 — seed-row registry, like controlled_vocabularies (T1.1 G11): domain
-- reference data that changes when the standard changes, so a row UPDATE
-- suffices rather than a code deploy.
create table quantity_kinds (
  key                 text primary key,
  label               text not null,
  category            text not null,
  canonical_unit_code text not null,
  compatible_units    text[] not null,
  standard_field_name text not null,
  sort_order          int not null,
  active              boolean not null default true
);

alter table quantity_kinds enable row level security;

-- Reference data: everyone authenticated reads; no client writes.
create policy quantity_kinds_read on quantity_kinds
  for select to authenticated using (true);

insert into quantity_kinds (key, label, category, canonical_unit_code, compatible_units, standard_field_name, sort_order) values
  ('temperature', 'Temperature', 'physical', 'Cel', array['Cel','degF','K'], 'temperature_C', 1),
  ('duration', 'Duration', 'physical', 'h', array['h','min','d'], 'duration_h', 2),
  ('starting_AA_concentration', 'Starting amino-acid concentration', 'concentration', 'mM', array['mM','uM'], 'starting_AA_concentration_mM', 3),
  ('starting_HA_concentration', 'Starting hydroxy-acid concentration', 'concentration', 'mM', array['mM','uM'], 'starting_HA_concentration_mM', 4),
  ('total_starting_monomer_concentration', 'Total starting monomer concentration', 'concentration', 'mM', array['mM','uM'], 'total_starting_monomer_concentration_mM', 5),
  ('nominal_reconstituted_product_concentration', 'Nominal reconstituted product concentration', 'concentration', 'mg/mL', array['mg/mL','ug/mL'], 'nominal_reconstituted_product_concentration_mg_mL', 6),
  ('LCMS_vial_AA_equivalent', 'LC-MS vial amino-acid equivalent', 'concentration', 'mM', array['mM','uM'], 'LCMS_vial_AA_equivalent_mM', 7),
  ('final_DMSO_percent_in_well', 'Final DMSO percent in well', 'concentration', '%', array['%'], 'final_DMSO_percent_in_well', 8),
  ('volume', 'Volume', 'physical', 'uL', array['uL','mL'], 'volume_uL', 9);

-- D1 — one extensible map, not a column pair per kind (mirrors T1.2's
-- sample_matrix/controls jsonb precedent). The existing temperature/
-- concentration text columns are untouched — legacy/display only (D4).
alter table experiments
  add column quantities jsonb not null default '{}';
