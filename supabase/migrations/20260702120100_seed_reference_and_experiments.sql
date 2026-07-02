-- ChemMemo Phase 2 seed — projects + EXP-001..012 from the mockup data.js
-- Seed rows have owner_id = null: readable by all (lab-shared), editable by none.

insert into projects (id, label, color) values
  ('wet-dry', 'Wet–Dry Cycling', '#3ee0c4'),
  ('depsi', 'Depsipeptides', '#7fd1ff'),
  ('lcms', 'LC-MS/MS', '#c2a3ff'),
  ('micro', 'Microscopy Assembly', '#ffd479')
on conflict (id) do nothing;

insert into experiments (id, name, date, researcher, project, reaction_type, compounds, metals, ph, concentration, temperature, cycles, methods, mz, observations) values
  ('EXP-001', 'His + TGA + Zn — wet–dry cycling', '2026-03-11', 'Y. Ezerzer', 'wet-dry', 'Wet–dry cycling / condensation', array['Histidine','Thioglycolic acid','Zinc chloride']::text[], array['Zn']::text[], 7, '50 mM each monomer, 5 mM ZnCl₂', '60 °C dry-down', 5, array['LC-MS/MS (neg)','Microscopy']::text[], array[297,595]::numeric[], 'Yellowing observed after the first dry-down. Persistent precipitate formed upon rehydration from cycle 3 onward. Solution turbidity increased with cycle count.'),
  ('EXP-002', 'Gly + Asp depsipeptide oligomerization', '2026-03-04', 'M. Frenkel-Pinter', 'depsi', 'Ester–amide depsipeptide condensation', array['Glycine','Aspartate','Glycolic acid']::text[], array[]::text[], 4, '100 mM total monomer', '85 °C dry-down', 8, array['LC-MS/MS (pos)','NMR']::text[], array[131,188,245]::numeric[], 'Clear viscous film after dry-down. LC-MS/MS (pos) showed laddering consistent with depsipeptide elongation up to tetramer. No precipitate.'),
  ('EXP-003', 'Ala + Cu coordination assembly', '2026-02-19', 'L. Cohen', 'micro', 'Metal-coordinated self-assembly', array['Alanine','Copper(II) sulfate']::text[], array['Cu']::text[], 6, '75 mM Ala, 10 mM CuSO₄', 'RT, slow evaporation', 1, array['Microscopy','UV-Vis']::text[], array[]::numeric[], 'Blue crystalline needles under bright-field microscopy. Birefringent under crossed polarizers. No droplet phase observed.'),
  ('EXP-004', 'His + TGA + Zn — pH 8.5 series', '2026-03-18', 'Y. Ezerzer', 'wet-dry', 'Wet–dry cycling / condensation', array['Histidine','Thioglycolic acid','Zinc chloride']::text[], array['Zn']::text[], 8.5, '50 mM each monomer, 5 mM ZnCl₂', '60 °C dry-down', 6, array['LC-MS/MS (neg)','Microscopy']::text[], array[297,611]::numeric[], 'At elevated pH 8.5 coacervate-like droplets appeared after rehydration (cycle 4). Droplets coalesced over ~20 min. m/z 297 retained; a new +16 species (m/z 611) suggests oxidation.'),
  ('EXP-005', 'Glycine + Fe wet–dry, pH 3.5', '2026-01-29', 'R. Mizrahi', 'wet-dry', 'Wet–dry cycling / condensation', array['Glycine','Iron(III) chloride']::text[], array['Fe']::text[], 3.5, '100 mM Gly, 8 mM FeCl₃', '70 °C dry-down', 10, array['LC-MS/MS (pos)']::text[], array[133,190]::numeric[], 'Strong rust-orange coloration from Fe. Diketopiperazine (m/z 115) and Gly₂/Gly₃ ladder detected. No droplets, fine amorphous precipitate.'),
  ('EXP-006', 'Depsipeptide + Zn microdroplet screen', '2026-04-02', 'M. Frenkel-Pinter', 'depsi', 'Depsipeptide / coacervation', array['Glycine','Lactic acid','Zinc chloride']::text[], array['Zn']::text[], 7.5, '120 mM monomer, 6 mM ZnCl₂', '80 °C dry-down', 7, array['LC-MS/MS (pos)','Microscopy','NMR']::text[], array[203,275,347]::numeric[], 'Robust droplet population after rehydration. Droplets persisted >2 h and concentrated a fluorescent dye, indicating partitioning. Depsipeptide ladder confirmed by MS.'),
  ('EXP-007', 'Aspartate fiber formation, pH 5', '2026-02-07', 'L. Cohen', 'micro', 'Self-assembly / fibrillization', array['Aspartate','Calcium chloride']::text[], array[]::text[], 5, '60 mM Asp, 20 mM CaCl₂', 'RT aging 48 h', 1, array['Microscopy']::text[], array[]::numeric[], 'Long entangled fibers under DIC microscopy, length up to ~200 µm. Network thickened over 48 h. No metal added beyond Ca²⁺ template.'),
  ('EXP-008', 'His + TGA + Zn — control, no cycling', '2026-03-12', 'Y. Ezerzer', 'wet-dry', 'Static incubation (control)', array['Histidine','Thioglycolic acid','Zinc chloride']::text[], array['Zn']::text[], 7, '50 mM each monomer, 5 mM ZnCl₂', 'RT, no dry-down', 0, array['LC-MS/MS (neg)']::text[], array[297]::numeric[], 'Control for EXP-001. Without dry-down cycling no precipitate and only trace m/z 297. Confirms cycling drives the condensation product.'),
  ('EXP-009', 'Mixed amino acid + Cu, pH 9', '2026-04-10', 'R. Mizrahi', 'lcms', 'Wet–dry cycling / condensation', array['Glycine','Alanine','Histidine','Copper(II) sulfate']::text[], array['Cu']::text[], 9, '40 mM each AA, 10 mM CuSO₄', '65 °C dry-down', 6, array['LC-MS/MS (neg)','LC-MS/MS (pos)']::text[], array[259,297,416]::numeric[], 'High-pH cycling produced a complex peptide mixture. Cu–His coordination peak prominent. m/z 297 again present alongside heavier adducts. Faint droplets at cycle 5.'),
  ('EXP-010', 'Glycolic/lactic depsipeptide NMR study', '2026-04-21', 'M. Frenkel-Pinter', 'depsi', 'Depsipeptide condensation', array['Glycolic acid','Lactic acid','Glycine']::text[], array[]::text[], 4.5, '150 mM total', '90 °C dry-down', 9, array['NMR','LC-MS/MS (pos)']::text[], array[177,249,321]::numeric[], 'Ester linkage signals tracked by ¹H NMR through cycles. Ester-to-amide exchange visible after cycle 6. Clean depsipeptide ladder, no metal.'),
  ('EXP-011', 'His + TGA + Zn — Fe substitution', '2026-05-06', 'Y. Ezerzer', 'lcms', 'Wet–dry cycling / condensation', array['Histidine','Thioglycolic acid','Iron(III) chloride']::text[], array['Fe']::text[], 6.5, '50 mM each monomer, 5 mM FeCl₃', '60 °C dry-down', 5, array['LC-MS/MS (neg)','Microscopy']::text[], array[297,350]::numeric[], 'Substituting Zn with Fe still yields m/z 297 but with a distinct Fe-adduct (m/z 350). Brown precipitate, no droplets — metal identity changes the assembly outcome.'),
  ('EXP-012', 'Alanine + Zn coacervate, pH 8', '2026-05-20', 'L. Cohen', 'micro', 'Coacervation / wet–dry', array['Alanine','Aspartate','Zinc chloride']::text[], array['Zn']::text[], 8, '80 mM AA, 8 mM ZnCl₂', '60 °C dry-down', 4, array['Microscopy','LC-MS/MS (pos)']::text[], array[217,289]::numeric[], 'Dense droplet phase formed at pH 8 after rehydration. Droplets wetted the glass and merged. MS confirmed short Ala/Asp peptides. Strong candidate for protocell mimic.')
on conflict (id) do nothing;

insert into experiment_files (experiment_id, kind, file_type, label) values
  ('EXP-001', 'upload', 'excel', 'EXP-001_conditions.xlsx'),
  ('EXP-001', 'link', 'folder', 'LC-MS_neg_run/'),
  ('EXP-001', 'upload', 'image', 'micro_cycle5_40x.tif'),
  ('EXP-002', 'upload', 'excel', 'EXP-002_yields.xlsx'),
  ('EXP-002', 'link', 'folder', 'LCMS_pos/'),
  ('EXP-002', 'upload', 'spectra', '1H_NMR_d2o.fid'),
  ('EXP-002', 'upload', 'report', 'EXP-002_summary.pdf'),
  ('EXP-003', 'upload', 'image', 'needles_polarized.tif'),
  ('EXP-003', 'upload', 'excel', 'uvvis_scan.xlsx'),
  ('EXP-004', 'link', 'folder', 'LCMS_neg_pH85/'),
  ('EXP-004', 'upload', 'image', 'droplets_timelapse/'),
  ('EXP-004', 'upload', 'excel', 'EXP-004_conditions.xlsx'),
  ('EXP-005', 'link', 'folder', 'LCMS_pos_Fe/'),
  ('EXP-005', 'upload', 'excel', 'EXP-005_data.xlsx'),
  ('EXP-006', 'upload', 'image', 'droplets_GFPpartition.tif'),
  ('EXP-006', 'link', 'folder', 'LCMS_pos_depsiZn/'),
  ('EXP-006', 'upload', 'spectra', '13C_NMR.fid'),
  ('EXP-006', 'upload', 'report', 'EXP-006_report.pdf'),
  ('EXP-007', 'upload', 'image', 'fibers_DIC_48h.tif'),
  ('EXP-008', 'link', 'folder', 'LCMS_neg_control/'),
  ('EXP-008', 'upload', 'excel', 'EXP-008_control.xlsx'),
  ('EXP-009', 'link', 'folder', 'LCMS_neg_mix/'),
  ('EXP-009', 'link', 'folder', 'LCMS_pos_mix/'),
  ('EXP-009', 'upload', 'excel', 'EXP-009_master.xlsx'),
  ('EXP-009', 'upload', 'si', 'SI_fig_mix.png'),
  ('EXP-010', 'upload', 'spectra', '1H_timecourse.fid'),
  ('EXP-010', 'link', 'folder', 'LCMS_pos_depsi/'),
  ('EXP-010', 'upload', 'report', 'EXP-010_NMR_report.pdf'),
  ('EXP-011', 'link', 'folder', 'LCMS_neg_Fe/'),
  ('EXP-011', 'upload', 'image', 'precip_Fe_20x.tif'),
  ('EXP-011', 'upload', 'excel', 'EXP-011_data.xlsx'),
  ('EXP-012', 'upload', 'image', 'coacervate_pH8.tif'),
  ('EXP-012', 'link', 'folder', 'LCMS_pos_AlaAsp/'),
  ('EXP-012', 'upload', 'si', 'SI_droplet_stats.png');
