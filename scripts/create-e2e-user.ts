// One-off / rerunnable: creates the dedicated E2E test account on whichever
// Supabase project .env.local points at. Self-contained like backfill-
// embeddings.ts so it runs under plain `node --env-file`.
// Usage: node --env-file=.env.local scripts/create-e2e-user.ts
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const EMAIL = "e2e-test@chememo.local";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase env vars.");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: existing } = await admin.auth.admin.listUsers();
  const already = existing?.users.find((u) => u.email === EMAIL);
  if (already) {
    console.log(`E2E test user already exists: ${EMAIL} (id ${already.id})`);
    return;
  }

  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: "E2E Test Account" },
  });
  if (error) throw error;

  console.log(`Created E2E test user: ${EMAIL} (id ${data.user.id})`);
  console.log(`Password (save this now — it is not stored anywhere): ${password}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
