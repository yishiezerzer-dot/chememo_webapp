// The open-questions model, kept when the four-agent crew was retired.
//
// This is the most reusable thing that directory produced: a per-field
// question list with stable identity, an "answer it" path
// (resolve_crew_unresolved_item / apply_ai_suggestion), and a database gate on
// completeness. It is what makes "3 things I still need from you" possible,
// and the conversational filer inherits it rather than inventing a second
// shape for the same idea.
//
// The tables and RPCs it names (experiment_crew_provenance,
// experiment_ai_suggestions) are deliberately NOT renamed. Renaming them would
// be a migration with no user-visible benefit, and their column meanings are
// unchanged: raw_source is still "the notes this experiment was started from".

export type UnresolvedItem = {
  field: string;
  issue: string;
  candidates: string[];
};

// The same item once persisted. The id is minted at commit time, never by a
// model — everything that later points at a checklist item joins on this id
// rather than on array position or field name, both of which have already
// shipped as bugs (migrations 20260828120000 and 20260828130000).
export type PersistedUnresolvedItem = UnresolvedItem & { id: string };

export type Recommendation = {
  field: string;
  suggestion: string;
  rationale: string;
};
