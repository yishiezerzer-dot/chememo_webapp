// Phase 6 verification — pure/guard checks that need no key and no DB.
// Usage: node scripts/test-embeddings.ts

import {
  buildEmbeddingInput,
  embedText,
  isEmbeddingEnabled,
  EMBEDDING_DIM,
} from "../lib/embeddings.ts";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean) => {
  console.log((cond ? "OK   " : "FAIL ") + name);
  if (cond) pass++;
  else fail++;
};

const sample = {
  name: "His + TGA + Zn — wet–dry cycling",
  reaction_type: "Wet–dry cycling / condensation",
  compounds: ["Histidine", "Thioglycolic acid", "Zinc chloride"],
  metals: ["Zn"],
  methods: ["LC-MS/MS (neg)", "Microscopy"],
  observations: "Yellowing after the first dry-down; precipitate on rehydration.",
  notes: null,
};

const input = buildEmbeddingInput(sample);
ok("input starts with the name", input.startsWith("His + TGA + Zn"));
ok("input includes observations", input.includes("Observations:"));
ok("input includes compounds", input.includes("Histidine"));
ok("input omits empty notes", !input.includes("Notes:"));
ok("input is deterministic", buildEmbeddingInput(sample) === input);
ok("EMBEDDING_DIM is 1536", EMBEDDING_DIM === 1536);

(async () => {
  const wasEnabled = isEmbeddingEnabled();
  ok("no OPENAI key ⇒ embeddings disabled", !wasEnabled);
  const vec = await embedText("anything");
  ok("guard no-ops cleanly (embedText → null with no key)", vec === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
