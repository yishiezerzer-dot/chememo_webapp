import { getHealthSnapshot } from "@/lib/health/service";

// Unauthenticated readiness/health signal (T0.9). Returns only aggregate
// counts — no row content, no PII, no secrets — so it's safe for an external
// uptime monitor or Railway healthcheck to poll. The richer T0.10 screen at
// /health (auth-gated) shares this same data via lib/health/service.ts.
export async function GET() {
  const snapshot = await getHealthSnapshot();
  return Response.json(snapshot, { status: snapshot.db.ok ? 200 : 503 });
}
