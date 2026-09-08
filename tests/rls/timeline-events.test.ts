// The chronological execution log (§10, gap G3). Only runs against a LOCAL
// Supabase instance — see experiments.rls.test.ts for why this is skipped
// outside the CI `rls` job.
//
// Proves the properties that make it a notebook rather than a scratchpad:
// append-only (no update, no delete, by anyone including the author),
// attribution cannot be forged, projected rows cannot be faked from a client,
// recorded_at is not client-settable, and a correction cannot point at another
// experiment's event.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestWorkspace } from "./helpers";

const URL = process.env.SUPABASE_LOCAL_URL;
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const ready = !!URL && !!ANON_KEY && !!SERVICE_ROLE_KEY;

describe.skipIf(!ready)("timeline_events (local Supabase)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;
  let outsiderClient: SupabaseClient;
  let userAId: string;
  let userBId: string;
  let workspaceId: string;
  const experimentIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = randomUUID();

    const mk = async (prefix: string) => {
      const email = `${prefix}-${randomUUID()}@test.local`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      const client = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
      await client.auth.signInWithPassword({ email, password });
      return { id: data.user.id, client };
    };

    const a = await mk("tl-a");
    const b = await mk("tl-b");
    const outsider = await mk("tl-out");
    userAId = a.id;
    userBId = b.id;
    userAClient = a.client;
    userBClient = b.client;
    outsiderClient = outsider.client;

    workspaceId = await createTestWorkspace(admin, [{ id: userAId }, { id: userBId }]);
    // The outsider gets their own workspace, so they are a legitimate user of
    // the app who simply has no business with this experiment.
    await createTestWorkspace(admin, [{ id: outsider.id }]);
  });

  afterAll(async () => {
    if (experimentIds.length) await admin.from("experiments").delete().in("id", experimentIds);
  });

  async function newExperiment(): Promise<string> {
    const id = `EXP-TL-${randomUUID().slice(0, 8)}`;
    experimentIds.push(id);
    await admin.from("experiments").insert({
      id, owner_id: userAId, name: "Timeline test", status: "draft", workspace_id: workspaceId,
    });
    return id;
  }

  async function log(client: SupabaseClient, experimentId: string, actorId: string, observation: string) {
    return client
      .from("timeline_events")
      .insert({ experiment_id: experimentId, actor_id: actorId, observation })
      .select()
      .single();
  }

  it("is append-only: nobody can update or delete an entry, the author included", async () => {
    const expId = await newExperiment();
    const { data: entry, error } = await log(userAClient, expId, userAId, "Precipitate formed at 40 min");
    expect(error).toBeNull();

    const { error: updateErr } = await userAClient
      .from("timeline_events")
      .update({ observation: "Actually nothing happened" })
      .eq("id", entry!.id);
    expect(updateErr).not.toBeNull();

    const { error: deleteErr } = await userAClient.from("timeline_events").delete().eq("id", entry!.id);
    // No DELETE policy means the delete matches no rows rather than raising;
    // either way the row must survive, which is what §10.2 actually requires.
    void deleteErr;
    const { data: still } = await userAClient
      .from("timeline_events")
      .select("observation")
      .eq("id", entry!.id)
      .maybeSingle();
    expect(still?.observation).toBe("Precipitate formed at 40 min");
  });

  it("attribution cannot be forged", async () => {
    const expId = await newExperiment();
    // userB is a writer in this workspace and still cannot log as userA.
    const { error } = await log(userBClient, expId, userAId, "Written under someone else's name");
    expect(error).not.toBeNull();
  });

  it("a client cannot claim a row was projected from a structured write", async () => {
    const expId = await newExperiment();
    const { error } = await userAClient.from("timeline_events").insert({
      experiment_id: expId,
      actor_id: userAId,
      observation: "Pretending to be a real measurement",
      source_type: "sample_measurements",
      source_id: randomUUID(),
    });
    expect(error).not.toBeNull();
  });

  it("recorded_at is the database's, not the client's", async () => {
    const expId = await newExperiment();
    const backdated = "2020-01-01T00:00:00.000Z";
    const { data: entry } = await userAClient
      .from("timeline_events")
      .insert({
        experiment_id: expId,
        actor_id: userAId,
        observation: "Written up later",
        // occurred_at is legitimately backdatable — you write up the morning's
        // work in the afternoon.
        occurred_at: backdated,
        // recorded_at is not, and the attempt must be ignored rather than honoured.
        recorded_at: backdated,
      })
      .select()
      .single();

    expect(entry!.occurred_at.slice(0, 4)).toBe("2020");
    expect(new Date(entry!.recorded_at).getFullYear()).toBeGreaterThan(2020);
  });

  it("a correction must belong to the same experiment as what it corrects", async () => {
    const expA = await newExperiment();
    const expB = await newExperiment();
    const { data: original } = await log(userAClient, expA, userAId, "Added 100 µL ACN");

    const { error: crossErr } = await userAClient.from("timeline_events").insert({
      experiment_id: expB,
      actor_id: userAId,
      observation: "Correction: it was 80 µL",
      corrects_event_id: original!.id,
    });
    expect(crossErr).not.toBeNull();

    // The same correction on the right experiment is fine, and leaves both rows.
    const { error: okErr } = await userAClient.from("timeline_events").insert({
      experiment_id: expA,
      actor_id: userAId,
      observation: "Correction after checking the pipette log: actual volume was 80 µL",
      corrects_event_id: original!.id,
    });
    expect(okErr).toBeNull();

    const { data: both } = await userAClient
      .from("timeline_events")
      .select("id")
      .eq("experiment_id", expA);
    expect(both!.length).toBe(2);
  });

  it("a member of another workspace sees nothing", async () => {
    const expId = await newExperiment();
    await log(userAClient, expId, userAId, "Workspace-private observation");

    const { data: asOutsider } = await outsiderClient
      .from("timeline_events")
      .select("id")
      .eq("experiment_id", expId);
    expect(asOutsider ?? []).toHaveLength(0);
  });

  it("an entry with nothing in it is refused", async () => {
    const expId = await newExperiment();
    const { error } = await userAClient
      .from("timeline_events")
      .insert({ experiment_id: expId, actor_id: userAId, observation: "   " });
    expect(error).not.toBeNull();
  });

  it("a structured write projects into the log automatically", async () => {
    const expId = await newExperiment();
    const { data: batch } = await admin
      .from("batches")
      .insert({ experiment_id: expId, label: "B1", workspace_id: workspaceId })
      .select()
      .single();
    const { data: sample } = await admin
      .from("samples")
      .insert({ batch_id: batch!.id, vial_label: "V1", workspace_id: workspaceId })
      .select()
      .single();

    const { error: evErr } = await userAClient.from("sample_events").insert({
      sample_id: sample!.id,
      event_type: "transfer",
      performed_by: userAId,
      details: { to_location_path: "Freezer A" },
    });
    expect(evErr).toBeNull();

    const { data: projected } = await userAClient
      .from("timeline_events")
      .select("event_type, source_type, actor_id")
      .eq("experiment_id", expId)
      .eq("source_type", "sample_events");
    expect(projected).toHaveLength(1);
    // Mapped onto §10.1's vocabulary, attributed to whoever wrote the source row.
    expect(projected![0].event_type).toBe("transferred");
    expect(projected![0].actor_id).toBe(userAId);
  });
});
