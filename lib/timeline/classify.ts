import { TIMELINE_EVENT_TYPES, type TimelineEventType } from "@/lib/timeline/event-types";

// What can be read out of a sentence without asking a model anything.
//
// This is the mechanism, not the fallback. Every log entry goes through it,
// with or without an API key; the AI filer that follows improves the fill rate
// and can be absent entirely without the notebook losing a feature. That
// ordering is deliberate — CLAUDE.md treats the keyless path as a supported
// mode, and a bench notebook that stops working when a provider is down is not
// a notebook.
//
// Pure: no `server-only`, no LLM import, no database. It unit-tests without a
// key, which is where most of the value in testing this actually is.

export type ExtractedQuantity = {
  /** A quantity_kinds key. */
  kind: string;
  value: number;
  /** A unit code from lib/quantities/convert.ts's table. */
  unitCode: string;
};

export type Classification = {
  eventType: TimelineEventType;
  /** The word that decided the type, so the UI can say why rather than just asserting. */
  matchedOn: string | null;
  ph: number | null;
  mz: number[];
  quantities: ExtractedQuantity[];
  /** Vial labels (§6.2's E014-B1-LacPro-R1 shape) and EXP ids mentioned in the text. */
  subjects: string[];
};

// First match wins, so the specific sits above the general: "took it out of
// the freezer" is a thaw, not a freeze, and the phrase that says so has to be
// tested before the bare word "freezer".
const TYPE_PATTERNS: { type: TimelineEventType; pattern: RegExp }[] = [
  // The subject often sits between the verb and the preposition ("took
  // E014-B1-LacPro-R1 out of the freezer"), so this cannot require a pronoun.
  { type: "thawed", pattern: /\b(thaw(ed|ing)?|took\b.{0,40}?\bout of the (freezer|fridge))/i },
  { type: "frozen", pattern: /\b(froze|frozen|freezing|into the freezer|at -?80|at -?20)\b/i },
  { type: "reconstituted", pattern: /\b(reconstitut(ed|ion)|resuspend(ed)?|redissolv(ed)?)\b/i },
  { type: "transferred", pattern: /\b(transferr?ed|aliquot(ed|s)?|moved .* (to|into)|split into)\b/i },
  { type: "analyzed", pattern: /\b(lc-?ms|ms\/ms|nmr|uv-?vis|hplc|injected|ran the|analys(ed|is)|analyz(ed)?|microscop)/i },
  { type: "measured", pattern: /\b(weigh(ed|t)?|massed|centrifug(ed)?|spun|read the|measur(ed|ement))\b/i },
  { type: "prepared", pattern: /\b(prepar(ed|ation)|made up|dissolv(ed)?|mixed|buffer(ed)?|diluted)\b/i },
  { type: "deviated", pattern: /\b(deviat(ed|ion)|went wrong|by mistake|accidental(ly)?|spilled|contaminat(ed|ion)|wrong (tube|vial|reagent))\b/i },
  // Disposal sits above failure: "discarded the failed batch" is an act of
  // disposal, and "failed" there describes the batch rather than naming the
  // event. Concrete verbs beat adjectives.
  { type: "disposed", pattern: /\b(discard(ed)?|dispos(ed|al)|binned|threw (it |them )?(away|out))\b/i },
  { type: "failed", pattern: /\b(failed|did ?n[o']?t work|no signal|nothing happened|abandoned)\b/i },
  { type: "shipped", pattern: /\b(shipp(ed|ing)|sent (it|them|the) .*(to|off)|couriered)\b/i },
  { type: "received", pattern: /\b(receiv(ed)?|arrived|came in|delivered)\b/i },
  { type: "decision", pattern: /\b(decid(ed)?|switching to|going to use|chose|will use)\b/i },
  { type: "started", pattern: /\b(start(ed|ing)?|began|kicked off|set (it |them )?going)\b/i },
  { type: "planned", pattern: /\b(plan(ned|ning)?|intend to|tomorrow I|next I will)\b/i },
  { type: "checked", pattern: /\b(check(ed)?|inspect(ed)?|looked at|had a look)\b/i },
];

// Only the units the standard's own examples use, matching convert.ts's table
// rather than inventing a parallel vocabulary.
const QUANTITY_PATTERNS: { kind: string; unitCode: string; pattern: RegExp }[] = [
  { kind: "temperature", unitCode: "Cel", pattern: /(-?\d+(?:\.\d+)?)\s*(?:°\s*C|degrees? ?C|C\b(?!a|l|o))/i },
  { kind: "duration", unitCode: "h", pattern: /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b/i },
  { kind: "duration", unitCode: "min", pattern: /(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)\b/i },
  { kind: "volume", unitCode: "uL", pattern: /(\d+(?:\.\d+)?)\s*(?:µL|uL|ul)\b/ },
  { kind: "volume", unitCode: "mL", pattern: /(\d+(?:\.\d+)?)\s*(?:mL|ml)\b/ },
  { kind: "sample_weight", unitCode: "mg", pattern: /(\d+(?:\.\d+)?)\s*mg\b/ },
  { kind: "sample_weight", unitCode: "g", pattern: /(\d+(?:\.\d+)?)\s*g\b(?!\/)/ },
  { kind: "stock_concentration", unitCode: "mM", pattern: /(\d+(?:\.\d+)?)\s*mM\b/ },
];

// §6.2's compact vial label (E014-B1-LacPro-R1) and the app's own EXP ids.
const SUBJECT_PATTERNS = [
  /\bE\d{3}-B\d+-[A-Za-z0-9]+(?:-R\d+)?\b/g,
  /\bEXP-\d+\b/g,
];

export function classifyLogText(text: string): Classification {
  const trimmed = text.trim();

  let eventType: TimelineEventType = "observed";
  let matchedOn: string | null = null;
  for (const { type, pattern } of TYPE_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m) {
      eventType = type;
      matchedOn = m[0];
      break;
    }
  }

  // pH is worth its own rule: it is the single most-filtered field in this
  // app's search, and "pH 7.4" is unambiguous in a way most numbers are not.
  const phMatch = trimmed.match(/\bpH\s*(?:=|of|was|is)?\s*(-?\d+(?:\.\d+)?)/i);
  const ph = phMatch ? Number(phMatch[1]) : null;

  const mzMatch = trimmed.match(/\bm\/z\s*(?:=|of|at)?\s*([\d.,\s]+)/i);
  const mz = mzMatch
    ? mzMatch[1]
        .split(/[,\s]+/)
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const quantities: ExtractedQuantity[] = [];
  for (const { kind, unitCode, pattern } of QUANTITY_PATTERNS) {
    // One value per kind: a sentence mentioning two volumes is ambiguous about
    // which one is "the" volume, and guessing is worse than leaving it out.
    if (quantities.some((q) => q.kind === kind)) continue;
    const m = trimmed.match(pattern);
    if (m) {
      const value = Number(m[1]);
      // A pH already claimed this number if they overlap; skip so "pH 7.4"
      // does not also register as 7.4 grams.
      if (Number.isFinite(value) && !(ph !== null && value === ph)) {
        quantities.push({ kind, value, unitCode });
      }
    }
  }

  const subjects = [
    ...new Set(SUBJECT_PATTERNS.flatMap((p) => trimmed.match(p) ?? [])),
  ];

  return { eventType, matchedOn, ph, mz, quantities, subjects };
}

// Guard for anything that reaches this from outside (an AI proposal, a URL
// parameter): the database CHECK is the real boundary, and this keeps a bad
// value from getting that far with a clearer failure.
export function isTimelineEventType(v: string): v is TimelineEventType {
  return (TIMELINE_EVENT_TYPES as readonly string[]).includes(v);
}
