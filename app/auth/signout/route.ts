import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Relative Location: behind Railway's proxy request.url reports the
  // container's internal host (localhost:8080), so never redirect from it.
  return new NextResponse(null, {
    status: 302,
    headers: { Location: "/login" },
  });
}
