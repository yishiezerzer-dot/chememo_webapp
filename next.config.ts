import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portability guardrail: standalone output makes Dockerfile / `next start`
  // deploys trivial on Railway (or Render/Fly as fallback hosts).
  output: "standalone",

  experimental: {
    serverActions: {
      // File uploads go through a server action, and Next's default body limit
      // is 1 MB — it rejected the request with a 413 before uploadFile() ever
      // ran, so every file between 1 and 10 MB crashed the experiment page's
      // error boundary instead of uploading. Must stay above MAX_UPLOAD_BYTES
      // (lib/files/limits.ts) with headroom for multipart encoding overhead,
      // so the app's own "max 10 MB" message is the one users actually see.
      bodySizeLimit: "12mb",
    },
  },

  // Defence-in-depth headers — the one genuinely actionable finding in the
  // 2026-08-26 QA audit (DEF-SEC-01). None of these change behaviour for a
  // signed-in user; they close off MIME sniffing, clickjacking and referrer
  // leakage to third parties.
  //
  // HSTS is deliberately NOT set here. Railway terminates TLS in front of the
  // app, so that header belongs at the edge; emitting it from Next would also
  // apply it to any non-HTTPS origin (a local `next start`), where it is wrong
  // and, once a browser has cached it, awkward to take back.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
