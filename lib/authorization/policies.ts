import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyWorkspaces } from "@/lib/workspaces/service";

// Every server action starts here: redirects to /login if there's no
// session, otherwise returns the authenticated user + a ready-to-use client.
// Authorization itself is enforced by Postgres RLS (lab-shared: read-all,
// edit-own) — this only centralizes the "is anyone logged in" check that was
// previously copy-pasted at the top of every action.
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const WORKSPACE_COOKIE = "cm_workspace";

// T2.1 — resolves which workspace a top-level create action (experiment,
// project, protocol, template, saved view, draft, series — the tables with
// no parent row to inherit workspace_id from via trigger) should write
// into. Self-serve creation (D1) means a user can belong to more than one
// workspace, so "the active one" is: the cm_workspace cookie if it's still
// a real membership, else the oldest membership (the single backfilled
// workspace, for everyone who hasn't created/joined a second one yet).
// Redirects to /workspaces/new if the user belongs to none at all.
// The read-path counterpart to requireWorkspace (2026-08-18). RLS confines a
// user to workspaces they belong to, but it cannot know which one they are
// currently *looking at* — so every list query returned the union of all of
// them. Switching workspace changed where new records were written while
// every list still showed everything, which flatly contradicts the promise
// on /workspaces/new that "a workspace is its own private space".
//
// Deliberately returns null rather than redirecting: this is called from read
// paths, including ones that render before a workspace has ever been chosen,
// and a redirect from inside a data fetch is a far worse failure mode than an
// unscoped-but-RLS-safe read. Callers treat null as "no active workspace, do
// not filter", which is exactly the previous behaviour.
export async function activeWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const memberships = await listMyWorkspaces(supabase, user.id);
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const cookieWorkspaceId = cookieStore.get(WORKSPACE_COOKIE)?.value;
  // Same resolution rule as requireWorkspace, membership check included: a
  // stale or forged cookie naming a workspace you are not in falls back to
  // your first one, it never scopes you into someone else's data.
  const active = memberships.find((m) => m.id === cookieWorkspaceId) ?? memberships[0];
  return active.id;
}

export async function requireWorkspace() {
  const { supabase, user } = await requireUser();
  const memberships = await listMyWorkspaces(supabase, user.id);
  if (memberships.length === 0) redirect("/workspaces/new");

  const cookieStore = await cookies();
  const cookieWorkspaceId = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const active = memberships.find((m) => m.id === cookieWorkspaceId) ?? memberships[0];
  return { supabase, user, workspaceId: active.id, memberships };
}
