// T3.4 AI observability tables. Only runs against a LOCAL Supabase instance
// (see experiments.rls.test.ts for why this is skipped outside the CI `rls`
// job).
//
// Proves: (1) a user can read their own ai_retrieval_events/ai_feedback
// rows; (2) a non-owner cannot (mirrors ai_requests' existing user_id-scoped
// policy exactly); (3) ai_model_versions/prompt_versions are lab-wide
// reference data — any authenticated user can read them, not just the row's
// creator (mirrors controlled_vocabularies' "everyone reads" shape).
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("ai observability tables (local Supabase)", () => {
  let admin: SupabaseClient;
  let ownerClient: SupabaseClient;
  let outsiderClient: SupabaseClient;
  let ownerId: string;
  let requestId: string;
  const experimentIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    async function newUser(prefix: string) {
      const email = `${prefix}-${randomUUID()}@test.local`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      const client = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
      const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;
      return { id: data.user.id, client };
    }

    const owner = await newUser("aiobs-owner");
    ownerId = owner.id;
    ownerClient = owner.client;
    const outsider = await newUser("aiobs-outsider");
    outsiderClient = outsider.client;

    const { data: req, error: reqErr } = await admin
      .from("ai_requests")
      .insert({ user_id: ownerId, endpoint: "ask_grounded", status: "ok", source_count: 1, model: "test-model" })
      .select("id")
      .single();
    if (reqErr) throw reqErr;
    requestId = req!.id as string;

    await admin.from("ai_retrieval_events").insert({
      ai_request_id: requestId,
      user_id: ownerId,
      query: "test query",
      ask_mode: "lab",
      router_mode: "filter",
      retrieved: [],
    });
    await admin.from("ai_feedback").insert({ ai_request_id: requestId, user_id: ownerId, rating: "up" });
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
  });

  it("the owner can read their own ai_retrieval_events and ai_feedback rows", async () => {
    const { data: events } = await ownerClient.from("ai_retrieval_events").select("id").eq("ai_request_id", requestId);
    expect((events ?? []).length).toBeGreaterThan(0);
    const { data: feedback } = await ownerClient.from("ai_feedback").select("id").eq("ai_request_id", requestId);
    expect((feedback ?? []).length).toBeGreaterThan(0);
  });

  it("a non-owner cannot read another user's ai_retrieval_events or ai_feedback rows", async () => {
    const { data: events } = await outsiderClient.from("ai_retrieval_events").select("id").eq("ai_request_id", requestId);
    expect(events ?? []).toEqual([]);
    const { data: feedback } = await outsiderClient.from("ai_feedback").select("id").eq("ai_request_id", requestId);
    expect(feedback ?? []).toEqual([]);
  });

  it("ai_model_versions and prompt_versions are readable by any authenticated user", async () => {
    const { data: versions, error: versionsErr } = await outsiderClient.from("prompt_versions").select("prompt_key, version");
    expect(versionsErr).toBeNull();
    expect((versions ?? []).length).toBeGreaterThanOrEqual(6);

    await admin.from("ai_model_versions").upsert(
      { provider: "gemini", chat_model: "eval-test-model", embedding_model: "eval-test-embed", embedding_dimensions: 1536 },
      { onConflict: "provider,chat_model,embedding_model,embedding_dimensions", ignoreDuplicates: true }
    );
    const { data: modelVersions, error: modelVersionsErr } = await outsiderClient
      .from("ai_model_versions")
      .select("chat_model")
      .eq("chat_model", "eval-test-model");
    expect(modelVersionsErr).toBeNull();
    expect((modelVersions ?? []).length).toBe(1);
  });
});
