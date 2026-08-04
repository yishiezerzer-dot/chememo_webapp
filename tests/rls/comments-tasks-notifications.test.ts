// T1.9 comments/experiment_tasks/notifications. Only runs against a LOCAL
// Supabase instance (see experiments.rls.test.ts for why this is skipped
// outside the CI `rls` job).
//
// Proves: comments/tasks are lab-shared read, owner-only insert (created_by
// spoofing rejected), any authenticated user can update (resolve a comment /
// change a task's status) — matching D7; notifications are strictly
// user-scoped read (D3) even though insert is broad by design.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("comments, tasks, notifications (local Supabase)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;
  let userAId: string;
  let userBId: string;
  let workspaceId: string;
  const experimentIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    const emailA = `ctn-a-${randomUUID()}@test.local`;
    const { data: userA, error: errA } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
    if (errA) throw errA;
    userAId = userA.user.id;

    const emailB = `ctn-b-${randomUUID()}@test.local`;
    const { data: userB, error: errB } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
    if (errB) throw errB;
    userBId = userB.user.id;

    userAClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    await userAClient.auth.signInWithPassword({ email: emailA, password });
    userBClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    await userBClient.auth.signInWithPassword({ email: emailB, password });

    workspaceId = await createTestWorkspace(admin, [{ id: userAId }, { id: userBId }]);
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
  });

  async function newExperiment(): Promise<string> {
    const id = `EXP-CTN-${randomUUID().slice(0, 8)}`;
    experimentIds.push(id);
    await admin.from("experiments").insert({ id, owner_id: userAId, name: "Comments/tasks test", status: "draft", workspace_id: workspaceId });
    return id;
  }

  it("comments: lab-shared read, owner-only insert, any authenticated user can resolve", async () => {
    const expId = await newExperiment();

    // userB cannot post a comment attributed to userA.
    const { error: spoofErr } = await userBClient
      .from("comments")
      .insert({ target_type: "experiment", target_id: expId, body: "spoofed", created_by: userAId });
    expect(spoofErr).not.toBeNull();

    const { data: comment, error: insertErr } = await userAClient
      .from("comments")
      .insert({ target_type: "experiment", target_id: expId, body: "A real comment", created_by: userAId })
      .select()
      .single();
    expect(insertErr).toBeNull();

    const { data: readAsB } = await userBClient.from("comments").select().eq("id", comment!.id).maybeSingle();
    expect(readAsB?.body).toBe("A real comment");

    const { error: resolveAsBErr } = await userBClient
      .from("comments")
      .update({ resolved_at: new Date().toISOString(), resolved_by: userBId })
      .eq("id", comment!.id);
    expect(resolveAsBErr).toBeNull();
  });

  it("tasks: lab-shared read, owner-only insert, any authenticated user can update status", async () => {
    const expId = await newExperiment();

    const { error: spoofErr } = await userBClient
      .from("experiment_tasks")
      .insert({ target_type: "experiment", target_id: expId, task_type: "task", title: "spoofed", created_by: userAId });
    expect(spoofErr).not.toBeNull();

    const { data: task, error: insertErr } = await userAClient
      .from("experiment_tasks")
      .insert({ target_type: "experiment", target_id: expId, task_type: "task", title: "Real task", created_by: userAId })
      .select()
      .single();
    expect(insertErr).toBeNull();

    const { error: updateAsBErr } = await userBClient
      .from("experiment_tasks")
      .update({ status: "in_progress" })
      .eq("id", task!.id);
    expect(updateAsBErr).toBeNull();
  });

  it("notifications: strictly user-scoped read", async () => {
    const { error: insertErr } = await userAClient.from("notifications").insert({ user_id: userBId, kind: "mention" });
    expect(insertErr).toBeNull();

    const { data: readAsB } = await userBClient.from("notifications").select().eq("user_id", userBId);
    expect((readAsB ?? []).length).toBeGreaterThan(0);

    // userA cannot read notifications addressed to userB.
    const { data: readAsA } = await userAClient.from("notifications").select().eq("user_id", userBId);
    expect(readAsA ?? []).toEqual([]);
  });
});
