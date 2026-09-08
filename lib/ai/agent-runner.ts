import type { z } from "zod";
import { chatComplete, parseJson } from "@/lib/llm";
import { logWarn } from "@/lib/logger";

// T3.7 D6 — shared retry-once helper every agent uses: call the model,
// validate against its zod schema, and on failure retry ONCE with the
// validation errors fed back. If that also fails, return null — the
// coordinator records the agent as failed (draft.failedAgents) rather than
// silently keeping a plausible-looking but wrong result.

type AttemptResult<T> = { ok: true; data: T } | { ok: false; error: string };

function attemptParse<T>(raw: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): AttemptResult<T> {
  const parsed = parseJson(raw);
  if (!parsed) return { ok: false, error: "Response was not valid JSON." };
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: JSON.stringify(result.error.issues).slice(0, 800) };
  }
  return { ok: true, data: result.data };
}

export async function runAgentStep<T>(
  agentName: string,
  system: string,
  user: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  maxTokens: number
): Promise<T | null> {
  const text = await chatComplete({ system, user, maxTokens });
  if (!text) {
    logWarn("crew/agent-runner", `${agentName}: empty completion (no retry possible)`);
    return null;
  }

  const first = attemptParse(text, schema);
  if (first.ok) return first.data;
  logWarn("crew/agent-runner", `${agentName}: first attempt failed validation`, { issues: first.error });

  // A truncated (not just malformed) response is a real, observed failure
  // mode for reasoning-tier models spending part of the token budget on
  // hidden reasoning — the SAME budget on retry would likely truncate again
  // the same way, so the retry gets real headroom, not just another attempt.
  const retryMaxTokens = Math.ceil(maxTokens * 1.5);
  const retryText = await chatComplete({
    system,
    user: `${user}\n\nYour previous response was invalid: ${first.error}\nRespond again with ONLY a corrected JSON object matching the schema exactly.`,
    maxTokens: retryMaxTokens,
  });
  if (!retryText) {
    logWarn("crew/agent-runner", `${agentName}: empty completion on retry`);
    return null;
  }

  const second = attemptParse(retryText, schema);
  if (!second.ok) {
    logWarn("crew/agent-runner", `${agentName}: retry also failed validation`, { issues: second.error });
    return null;
  }
  return second.data;
}
