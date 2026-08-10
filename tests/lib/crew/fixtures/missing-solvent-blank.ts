// T3.7 spec's own headline acceptance scenario: rough chemistry bench notes
// that describe a catalyst/heat comparison but never mention a blank (no-
// reagent) control — the Controls & Replicates agent's checklist for the
// "chemistry" experiment type requires one. Used to prove the coordinator
// correctly surfaces a Controls finding into the final draft's `unresolved`
// block; it does not itself prove a live model would catch the gap (that is
// what scripts/eval-retrieval.ts-style live evaluation is for, not a unit test).
export const MISSING_SOLVENT_BLANK_NOTES = `Glycolic acid + Fe(III) at pH 5, 60C water bath, 3 replicates.
Ran with catalyst present, and a no-heat control at room temp.
Sampled at 1h and 4h for LC-MS. No solvent-only blank run this time.`;
