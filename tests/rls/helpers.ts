// Shared setup for T2.1 workspace-scoped RLS tests: every workspace-owned
// table's write policies now require the acting user to be a
// workspace_members row (viewer role is read-only; any other role can
// write). This factors out the "make a scratch workspace and add these test
// users to it" step every RLS suite below T2.1 needs, so each suite's own
// beforeAll doesn't have to repeat it.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createTestWorkspace(
  admin: SupabaseClient,
  members: Array<{ id: string; role?: string }>
): Promise<string> {
  const { data, error } = await admin
    .from("workspaces")
    .insert({ name: `Test workspace ${randomUUID()}` })
    .select("id")
    .single();
  if (error) throw error;
  const workspaceId = data!.id as string;
  if (members.length) {
    const { error: memberErr } = await admin
      .from("workspace_members")
      .insert(members.map((m) => ({ workspace_id: workspaceId, user_id: m.id, role: m.role ?? "researcher" })));
    if (memberErr) throw memberErr;
  }
  return workspaceId;
}
