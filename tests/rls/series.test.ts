// T1.7 experiment_series / experiment_series_members. Only runs against a
// LOCAL Supabase instance (see experiments.rls.test.ts for why this is
// skipped outside the CI `rls` job).
//
// Proves both tables are lab-shared read+write (D3), matching
// experiment_templates/protocols: any authenticated user creates a series,
// a different user adds a member and reads it back.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("experiment series (local Supabase)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;
  let userAId: string;
  const experimentIds: string[] = [];
  const seriesIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    const emailA = `series-a-${randomUUID()}@test.local`;
    const { data: userA, error: errA } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
    if (errA) throw errA;
    userAId = userA.user.id;

    const emailB = `series-b-${randomUUID()}@test.local`;
    const { error: errB } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
    if (errB) throw errB;

    userAClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInA } = await userAClient.auth.signInWithPassword({ email: emailA, password });
    if (signInA) throw signInA;

    userBClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInB } = await userBClient.auth.signInWithPassword({ email: emailB, password });
    if (signInB) throw signInB;
  });

  afterAll(async () => {
    if (seriesIds.length) await admin.from("experiment_series").delete().in("id", seriesIds);
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
  });

  it("is lab-shared: a different user adds a member to another user's series and reads it back", async () => {
    const { data: series, error: seriesErr } = await userAClient
      .from("experiment_series")
      .insert({ name: "Wet-dry dose-response, Zn", created_by: userAId })
      .select()
      .single();
    expect(seriesErr).toBeNull();
    seriesIds.push(series!.id);

    const expId = `EXP-SERIES-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await admin.from("experiments").insert({ id: expId, owner_id: userAId, name: "Series member", status: "draft" });

    // userB (not the series creator) can still add a member.
    const { error: addErr } = await userBClient
      .from("experiment_series_members")
      .insert({ series_id: series!.id, experiment_id: expId });
    expect(addErr).toBeNull();

    const { data: members, error: readErr } = await userBClient
      .from("experiment_series_members")
      .select()
      .eq("series_id", series!.id);
    expect(readErr).toBeNull();
    expect(members).toHaveLength(1);
    expect(members![0].experiment_id).toBe(expId);
  });

  it("rejects adding the same experiment to the same series twice", async () => {
    const { data: series } = await userAClient
      .from("experiment_series")
      .insert({ name: "Duplicate-member test", created_by: userAId })
      .select()
      .single();
    seriesIds.push(series!.id);

    const expId = `EXP-SERIESDUP-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await admin.from("experiments").insert({ id: expId, owner_id: userAId, name: "Dup member", status: "draft" });

    const { error: firstErr } = await userAClient
      .from("experiment_series_members")
      .insert({ series_id: series!.id, experiment_id: expId });
    expect(firstErr).toBeNull();

    const { error: dupErr } = await userAClient
      .from("experiment_series_members")
      .insert({ series_id: series!.id, experiment_id: expId });
    expect(dupErr).not.toBeNull();
    expect(dupErr?.code).toBe("23505");
  });
});
