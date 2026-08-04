// T1.1 lifecycle trigger tests. Only runs against a LOCAL Supabase instance
// (see experiments.rls.test.ts for why this suite is skipped outside the CI
// `rls` job — Docker isn't available on this dev machine).
//
// enforce_experiment_lifecycle() is a BEFORE UPDATE trigger, which fires
// regardless of RLS (RLS bypass only skips policy checks, not triggers). So
// these tests use the admin (service-role) client throughout — they prove
// the trigger's own rules, not the ownership isolation already covered by
// experiments.rls.test.ts.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_LOCAL_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!SERVICE_ROLE_KEY;

const LOCKED_STATES = ["completed", "reviewed", "archived", "failed", "cancelled"];

describe.skipIf(!ready)("experiment lifecycle trigger (local Supabase)", () => {
  let admin: SupabaseClient;
  let ownerId: string;
  let workspaceId: string;
  const ids: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const email = `lifecycle-${randomUUID()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
    });
    if (error) throw error;
    ownerId = data.user.id;

    // This suite writes exclusively through the admin (service-role) client,
    // which bypasses RLS entirely — so no workspace_members row is needed
    // here, unlike every other RLS suite. A real workspace row is still
    // required to satisfy the workspace_id NOT NULL constraint on inserts.
    const { data: ws, error: wsErr } = await admin.from("workspaces").insert({ name: `Lifecycle test ws ${randomUUID()}` }).select("id").single();
    if (wsErr) throw wsErr;
    workspaceId = ws!.id;
  });

  afterAll(async () => {
    if (ids.length) await admin.from("experiments").delete().in("id", ids);
  });

  async function makeExperiment(overrides: Record<string, unknown> = {}) {
    const id = `EXP-LC-${randomUUID().slice(0, 8)}`;
    ids.push(id);
    const { error } = await admin
      .from("experiments")
      .insert({ id, owner_id: ownerId, name: "Lifecycle test", workspace_id: workspaceId, ...overrides });
    if (error) throw error;
    return id;
  }

  function setStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
    return admin.from("experiments").update({ status, ...extra }).eq("id", id).select().maybeSingle();
  }

  it("a null-status legacy row accepts any first classification", async () => {
    const id = await makeExperiment();
    const { error } = await setStatus(id, "in_progress", { acceptance_criteria: "None — exploratory." });
    expect(error).toBeNull();
  });

  it("rejects starting with empty acceptance criteria, and locks them once provided (§8.6)", async () => {
    const id = await makeExperiment({ status: "draft" });
    expect((await setStatus(id, "in_progress")).error).not.toBeNull();

    const good = await setStatus(id, "in_progress", { acceptance_criteria: "pH stays within 6.8-7.2." });
    expect(good.error).toBeNull();
    expect(good.data?.acceptance_criteria_locked_at).not.toBeNull();
  });

  it("rejects editing acceptance criteria once locked, including after a reopen", async () => {
    const id = await makeExperiment({ status: "draft" });
    await setStatus(id, "in_progress", { acceptance_criteria: "Yield > 10%." });

    const editLocked = await admin
      .from("experiments")
      .update({ acceptance_criteria: "Changed." })
      .eq("id", id);
    expect(editLocked.error).not.toBeNull();

    await admin.from("experiments").update({ conclusion: "Done." }).eq("id", id);
    await setStatus(id, "completed");

    const { error: reopenErr } = await admin.rpc("reopen_experiment", {
      p_id: id,
      p_reason: "Recheck a value.",
    });
    expect(reopenErr).toBeNull();

    const editAfterReopen = await admin
      .from("experiments")
      .update({ acceptance_criteria: "Changed again." })
      .eq("id", id);
    expect(editAfterReopen.error).not.toBeNull();
  });

  it("rejects reopening with a blank reason", async () => {
    const id = await makeExperiment({
      status: "in_progress",
      acceptance_criteria: "None.",
      acceptance_criteria_locked_at: new Date().toISOString(),
      conclusion: "Done.",
    });
    await setStatus(id, "completed");
    const { error } = await admin.rpc("reopen_experiment", { p_id: id, p_reason: "   " });
    expect(error).not.toBeNull();
  });

  it("rejects completing with an empty conclusion (§15.2)", async () => {
    const id = await makeExperiment({
      status: "in_progress",
      acceptance_criteria: "None.",
      acceptance_criteria_locked_at: new Date().toISOString(),
    });
    expect((await setStatus(id, "completed")).error).not.toBeNull();
  });

  it("locks a completed record against name/conclusion/deleted_at edits, but allows reviewed/archived moves", async () => {
    const id = await makeExperiment({
      status: "in_progress",
      acceptance_criteria: "None.",
      acceptance_criteria_locked_at: new Date().toISOString(),
      conclusion: "It worked.",
    });
    const complete = await setStatus(id, "completed");
    expect(complete.error).toBeNull();
    expect(complete.data?.locked_at).not.toBeNull();

    expect((await admin.from("experiments").update({ name: "hijacked" }).eq("id", id)).error).not.toBeNull();
    expect(
      (await admin.from("experiments").update({ conclusion: "changed" }).eq("id", id)).error
    ).not.toBeNull();
    expect(
      (await admin.from("experiments").update({ deleted_at: new Date().toISOString() }).eq("id", id)).error
    ).not.toBeNull();

    expect((await setStatus(id, "reviewed")).error).toBeNull();
    expect((await setStatus(id, "archived")).error).toBeNull();
  });

  const ILLEGAL_TRANSITIONS: [string, string][] = [
    ["draft", "completed"],
    ["draft", "reviewed"],
    ["draft", "archived"],
    ["planned", "completed"],
    ["planned", "failed"],
    ["paused", "completed"],
    ["completed", "draft"],
    ["completed", "planned"],
    ["reviewed", "completed"],
    ["reviewed", "draft"],
    ["archived", "completed"],
    ["archived", "reviewed"],
    ["failed", "completed"],
    ["failed", "draft"],
    ["cancelled", "completed"],
  ];

  it.each(ILLEGAL_TRANSITIONS)("rejects the illegal transition %s -> %s", async (from, to) => {
    const id = await makeExperiment({
      status: from,
      locked_at: LOCKED_STATES.includes(from) ? new Date().toISOString() : null,
    });
    expect((await setStatus(id, to)).error).not.toBeNull();
  });

  it("D12 — a draft row soft-deletes; planned/in_progress/paused/null rows reject deleted_at", async () => {
    const draftId = await makeExperiment({ status: "draft" });
    expect(
      (await admin.from("experiments").update({ deleted_at: new Date().toISOString() }).eq("id", draftId)).error
    ).toBeNull();

    for (const status of ["planned", "in_progress", "paused"]) {
      const id = await makeExperiment({ status });
      const { error } = await admin
        .from("experiments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      expect(error).not.toBeNull();
    }

    const legacyId = await makeExperiment(); // status stays null
    expect(
      (await admin.from("experiments").update({ deleted_at: new Date().toISOString() }).eq("id", legacyId)).error
    ).not.toBeNull();
  });

  it("D12 — failed and cancelled both reach archived", async () => {
    const failedId = await makeExperiment({
      status: "in_progress",
      acceptance_criteria: "None.",
      acceptance_criteria_locked_at: new Date().toISOString(),
    });
    await setStatus(failedId, "failed");
    expect((await setStatus(failedId, "archived")).error).toBeNull();

    const cancelledId = await makeExperiment({ status: "draft" });
    await setStatus(cancelledId, "cancelled");
    expect((await setStatus(cancelledId, "archived")).error).toBeNull();
  });

  it("D12 regression guard: an archived experiment stays behind the same `deleted_at is null` filter lib/search.ts and lib/rag.ts use", async () => {
    const id = await makeExperiment({ status: "draft" });
    await setStatus(id, "cancelled");
    await setStatus(id, "archived");

    const { data } = await admin.from("experiments").select("id, status").is("deleted_at", null).eq("id", id);
    expect(data).toEqual([expect.objectContaining({ id, status: "archived" })]);
  });
});
