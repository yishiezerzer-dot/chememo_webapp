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

  // 20260908120000 — comments_update checks workspace-writer and nothing else,
  // and PostgREST is reachable from the browser with the user's own JWT, so
  // these are the only limits that exist. The body case is the one that
  // matters most: trg_evidence_chunk_comment fires on UPDATE too, so a
  // rewritten body is re-embedded and served back in RAG answers still
  // attributed to its original author.
  it("comments: a non-author cannot rewrite the body, the author, or who resolved it", async () => {
    const expId = await newExperiment();
    const { data: comment } = await userAClient
      .from("comments")
      .insert({ target_type: "experiment", target_id: expId, body: "Original wording", created_by: userAId })
      .select()
      .single();

    // userB is a writer in this workspace, and still cannot rewrite the text.
    const { error: bodyErr } = await userBClient
      .from("comments")
      .update({ body: "Rewritten by someone else" })
      .eq("id", comment!.id);
    expect(bodyErr).not.toBeNull();

    const { data: afterBody } = await userAClient
      .from("comments")
      .select("body")
      .eq("id", comment!.id)
      .single();
    expect(afterBody!.body).toBe("Original wording");

    // Reassigning authorship is refused for everyone, the author included.
    const { error: authorErr } = await userAClient
      .from("comments")
      .update({ created_by: userBId })
      .eq("id", comment!.id);
    expect(authorErr).not.toBeNull();

    // Forging the sign-off: resolving is allowed, resolving as someone else is not.
    const { error: forgedErr } = await userBClient
      .from("comments")
      .update({ resolved_at: new Date().toISOString(), resolved_by: userAId })
      .eq("id", comment!.id);
    expect(forgedErr).not.toBeNull();

    // The target cannot be repointed after the fact.
    const otherExp = await newExperiment();
    const { error: targetErr } = await userAClient
      .from("comments")
      .update({ target_id: otherExp })
      .eq("id", comment!.id);
    expect(targetErr).not.toBeNull();

    // What must still work: the author edits their own text, and anyone
    // resolves and reopens as themselves.
    const { error: ownEditErr } = await userAClient
      .from("comments")
      .update({ body: "Reworded by its author" })
      .eq("id", comment!.id);
    expect(ownEditErr).toBeNull();

    const { error: resolveErr } = await userBClient
      .from("comments")
      .update({ resolved_at: new Date().toISOString(), resolved_by: userBId })
      .eq("id", comment!.id);
    expect(resolveErr).toBeNull();

    const { error: reopenErr } = await userBClient
      .from("comments")
      .update({ resolved_at: null, resolved_by: null })
      .eq("id", comment!.id);
    expect(reopenErr).toBeNull();

    // And the author can still edit a comment somebody else resolved — the
    // resolved_by rule is checked only when resolved_by itself changes.
    await userBClient
      .from("comments")
      .update({ resolved_at: new Date().toISOString(), resolved_by: userBId })
      .eq("id", comment!.id);
    const { error: editWhileResolvedErr } = await userAClient
      .from("comments")
      .update({ body: "Edited after someone else resolved it" })
      .eq("id", comment!.id);
    expect(editWhileResolvedErr).toBeNull();
  });

  // 20260908130000 — a soft-deleted experiment disappears for everyone but its
  // owner (experiments_read), but its steps and files did not, and since
  // 2026-09-07 both are comment targets whose bodies get embedded into
  // evidence_chunks and become RAG-retrievable workspace-wide.
  it("files and steps of a soft-deleted experiment are hidden from everyone but the owner", async () => {
    const expId = await newExperiment();
    const { data: file } = await admin
      .from("experiment_files")
      .insert({ experiment_id: expId, kind: "link", url: "https://example.org/x", label: "A file", workspace_id: workspaceId })
      .select()
      .single();

    // Visible to both while the experiment is live.
    const { data: beforeA } = await userAClient.from("experiment_files").select("id").eq("id", file!.id).maybeSingle();
    const { data: beforeB } = await userBClient.from("experiment_files").select("id").eq("id", file!.id).maybeSingle();
    expect(beforeA?.id).toBe(file!.id);
    expect(beforeB?.id).toBe(file!.id);

    // userA owns it and soft-deletes it (only drafts may be soft-deleted --
    // lifecycle clause a2 -- and newExperiment creates drafts).
    const { error: delErr } = await userAClient
      .from("experiments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", expId);
    expect(delErr).toBeNull();

    // The owner keeps seeing it, which is what makes restore work.
    const { data: afterA } = await userAClient.from("experiment_files").select("id").eq("id", file!.id).maybeSingle();
    expect(afterA?.id).toBe(file!.id);

    // Everyone else loses it, and so loses the comment target with it.
    const { data: afterB } = await userBClient.from("experiment_files").select("id").eq("id", file!.id).maybeSingle();
    expect(afterB).toBeNull();

    const { error: commentErr } = await userBClient
      .from("comments")
      .insert({ target_type: "experiment_file", target_id: file!.id, body: "on a deleted record", created_by: userBId });
    expect(commentErr).not.toBeNull();
  });

  // 20260908130000 — set_workspace_from_comment_id only derived the workspace
  // when the client left it null, and the insert policy then trusted whatever
  // was supplied.
  it("comment_mentions cannot be labelled with a workspace the client chose", async () => {
    const expId = await newExperiment();
    const { data: comment } = await userAClient
      .from("comments")
      .insert({ target_type: "experiment", target_id: expId, body: "Mention test", created_by: userAId })
      .select()
      .single();

    const otherWorkspaceId = await createTestWorkspace(admin, [{ id: userAId }]);
    await userAClient
      .from("comment_mentions")
      .insert({ comment_id: comment!.id, mentioned_user_id: userBId, workspace_id: otherWorkspaceId });

    // Whatever the client asked for, the row is derived from its parent comment.
    const { data: mention } = await admin
      .from("comment_mentions")
      .select("workspace_id")
      .eq("comment_id", comment!.id)
      .maybeSingle();
    if (mention) expect(mention.workspace_id).toBe(workspaceId);
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
