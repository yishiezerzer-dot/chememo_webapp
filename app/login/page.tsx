"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/brand-mark";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      // Supabase hides "email already registered" to prevent enumeration:
      // it returns a user with an empty identities array and no session.
      if (data.user && data.user.identities?.length === 0) {
        setError("An account with this email already exists. Sign in instead.");
        setLoading(false);
        return;
      }
      if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setNotice("Check your email for a confirmation link, then sign in.");
        setLoading(false);
      }
    }
  }

  const signin = mode === "signin";

  return (
    <div id="auth" className="auth">
      <section className="auth-hero">
        <div className="auth-brand">
          <BrandMark />
          <div>
            <div className="brand-name">
              Chem<b>Memo</b>
            </div>
            <div className="brand-sub">MFP Origins-of-Life Lab</div>
          </div>
        </div>

        <div>
          <span className="eyebrow">AI-assisted electronic lab notebook</span>
          <h1>
            The notebook for <em>primordial</em> chemistry.
          </h1>
          <p className="lede">
            Capture every wet–dry cycle, spectrum and droplet. Then ask in
            plain language — and get grounded answers cited straight back to
            your experiments.
          </p>
        </div>

        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--ink-mute)",
            letterSpacing: ".1em",
          }}
        >
          MFP LAB · SHARED NOTEBOOK
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card glass" style={{ padding: "34px 30px" }}>
          <h2>{signin ? "Welcome back" : "Create your account"}</h2>
          <p className="sub">
            {signin
              ? "Sign in to your MFP lab notebook."
              : "Join the MFP lab notebook."}
          </p>
          <form onSubmit={handleSubmit}>
            {!signin && (
              <div className="field">
                <label>Full name</label>
                <input
                  type="text"
                  placeholder="Yishi Ezerzer"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                placeholder="you@mail.huji.ac.il"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            {error && (
              <p style={{ color: "var(--rose)", fontSize: 13 }}>{error}</p>
            )}
            {notice && (
              <p style={{ color: "var(--teal)", fontSize: 13 }}>{notice}</p>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
            >
              {loading ? "…" : signin ? "Sign in" : "Sign up"}
            </button>
          </form>
          <div className="auth-toggle">
            {signin ? "New to the lab? " : "Already have an account? "}
            <a
              role="button"
              tabIndex={0}
              style={{ color: "var(--teal)", cursor: "pointer" }}
              onClick={() => {
                setMode(signin ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
            >
              {signin ? "Create an account" : "Sign in"}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
