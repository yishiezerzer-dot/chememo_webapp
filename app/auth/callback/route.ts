import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the PKCE code exchange after email confirmation links.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Relative Location: behind Railway's proxy request.url reports the
  // container's internal host (localhost:8080), so never redirect from it.
  let dest = "/login";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      dest = "/dashboard";
    }
  }

  return new NextResponse(null, { status: 302, headers: { Location: dest } });
}
