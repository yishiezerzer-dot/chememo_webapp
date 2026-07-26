import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
