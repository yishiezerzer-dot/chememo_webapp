-- T2.8 stage 1 — chemical structure support: store SMILES/InChI/InChIKey +
-- render 2D. See Spec: ChemMemo_Feature_ChemicalStructureSupport_Spec.md (D1).
-- Additive only: 'inchi' joins the existing identifier_type vocabulary
-- (cas/pubchem_cid/inchikey/smiles/internal_code/alias, T2.2) — no new table,
-- since T2.2's material_identifiers already fits this need exactly.

alter table material_identifiers drop constraint if exists material_identifiers_identifier_type_check;
alter table material_identifiers add constraint material_identifiers_identifier_type_check
  check (identifier_type in ('cas', 'pubchem_cid', 'inchikey', 'inchi', 'smiles', 'internal_code', 'alias'));
