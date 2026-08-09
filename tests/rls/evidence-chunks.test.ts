// T3.1 chunked, versioned evidence index. Only runs against a LOCAL Supabase
// instance (see experiments.rls.test.ts for why this is skipped outside the
// CI `rls` job).
//
// Proves: (1) inserting an experiment enqueues exactly one evidence_chunks
// row via the trigger, workspace_id inherited correctly; (2) an unrelated
// column update with unchanged narrative content does NOT reset a
// already-processed chunk back to pending (content_hash skip); (3) changing
// the narrative content DOES reset it to pending with a new hash; (4) a
// comment on an experiment resolves metadata.experiment_id correctly; (5) a
// non-member cannot read another workspace's evidence_chunks rows (RLS).
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("evidence chunks (local Supabase)", () => {
  let admin: SupabaseClient;
  let memberClient: SupabaseClient;
  let outsiderClient: SupabaseClient;
  let memberId: string;
  let outsiderId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
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

    const member = await newUser("evchunk-member");
    memberId = member.id;
    memberClient = member.client;
    const outsider = await newUser("evchunk-outsider");
    outsiderId = outsider.id;
    outsiderClient = outsider.client;

    workspaceId = await createTestWorkspace(admin, [{ id: memberId }]);
    otherWorkspaceId = await createTestWorkspace(admin, [{ id: outsiderId }]);
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
  });

  it("enqueues one evidence_chunks row on experiment insert, workspace inherited", async () => {
    const expId = `EXP-EVCH-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await memberClient
      .from("experiments")
      .insert({ id: expId, owner_id: memberId, name: "Evidence chunk test", status: "draft", workspace_id: workspaceId, observations: "Formed a clear droplet." });

    const { data: chunks } = await admin
      .from("evidence_chunks")
      .select("*")
      .eq("source_type", "experiment")
      .eq("source_id", expId);
    expect(chunks).toHaveLength(1);
    expect(chunks![0].workspace_id).toBe(workspaceId);
    expect(chunks![0].status).toBe("pending");
    expect(chunks![0].content).toContain("Formed a clear droplet.");
  });

  it("does not reset an already-processed chunk when narrative content is unchanged", async () => {
    const expId = `EXP-EVCH-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await memberClient
      .from("experiments")
      .insert({ id: expId, owner_id: memberId, name: "Hash skip test", status: "draft", workspace_id: workspaceId, observations: "Stable emulsion." });

    const { data: before } = await admin
      .from("evidence_chunks")
      .select("id, content_hash")
      .eq("source_type", "experiment")
      .eq("source_id", expId)
      .single();

    // Simulate the poller having already embedded this chunk.
    await admin.from("evidence_chunks").update({ status: "done", indexed_at: new Date().toISOString() }).eq("id", before!.id);

    // Touch an unrelated column — narrative content (name/observations/notes/
    // date/researcher/project) is unchanged.
    await memberClient.from("experiments").update({ researcher: "Dr. Same" }).eq("id", expId);

    const { data: afterUnrelated } = await admin
      .from("evidence_chunks")
      .select("status, content_hash")
      .eq("id", before!.id)
      .single();
    expect(afterUnrelated!.status).toBe("done");
    expect(afterUnrelated!.content_hash).toBe(before!.content_hash);

    // Now actually change the narrative content — hash changes, resets to pending.
    await memberClient.from("experiments").update({ observations: "Stable emulsion, then phase-separated." }).eq("id", expId);

    const { data: afterChanged } = await admin
      .from("evidence_chunks")
      .select("status, content_hash")
      .eq("id", before!.id)
      .single();
    expect(afterChanged!.status).toBe("pending");
    expect(afterChanged!.content_hash).not.toBe(before!.content_hash);
  });

  it("resolves a comment's parent experiment id into metadata", async () => {
    const expId = `EXP-EVCH-${randomUUID().slice(0, 8)}`;
    experimentIds.push(expId);
    await memberClient
      .from("experiments")
      .insert({ id: expId, owner_id: memberId, name: "Comment test", status: "draft", workspace_id: workspaceId });

    await memberClient.from("comments").insert({ target_type: "experiment", target_id: expId, body: "Looks promising.", created_by: memberId });

    const { data: chunks } = await admin
      .from("evidence_chunks")
      .select("*")
      .eq("source_type", "comment");
    const match = (chunks ?? []).find((c) => (c.metadata as { experiment_id?: string }).experiment_id === expId);
    expect(match).toBeTruthy();
    expect(match!.workspace_id).toBe(workspaceId);
    expect(match!.content).toContain("Looks promising.");
  });

  it("a non-member cannot read another workspace's evidence_chunks rows", async () => {
    const outsiderExpId = `EXP-EVCH-OUT-${randomUUID().slice(0, 8)}`;
    experimentIds.push(outsiderExpId);
    await admin
      .from("experiments")
      .insert({ id: outsiderExpId, owner_id: outsiderId, name: "Outsider evidence exp", status: "draft", workspace_id: otherWorkspaceId, observations: "Secret result." });

    const { data: chunk } = await admin
      .from("evidence_chunks")
      .select("id")
      .eq("source_type", "experiment")
      .eq("source_id", outsiderExpId)
      .single();

    const { data: readChunk } = await memberClient.from("evidence_chunks").select("id").eq("id", chunk!.id).maybeSingle();
    expect(readChunk).toBeNull();

    // The rightful workspace member (outsiderClient) can read their own.
    const { data: ownRead } = await outsiderClient.from("evidence_chunks").select("id").eq("id", chunk!.id).maybeSingle();
    expect(ownRead).not.toBeNull();
  });
});
