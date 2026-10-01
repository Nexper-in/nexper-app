"use client";

import { applyTheme, readTheme } from "@/lib/theme";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

// Deliberately separate from /login — platform admin isn't reachable from
// the regular owner/staff sign-in flow or from the app's own sidebar
// (see components/Sidebar.js), only by knowing this URL directly. Runs
// the whole platform-admin area in the app's existing "dark" token
// palette (see app/globals.css) rather than a one-off hand-rolled one,
// so Modal/Field and every ks-* class render correctly here too.
export default function AdminLoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    delete document.documentElement.dataset.theme; // admin always uses Night
    return () => {
      applyTheme(readTheme());
    };
  }, []);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session) router.replace("/admin");
        else setCheckingSession(false);
      })
      .catch(() => setCheckingSession(false));
  }, [supabase, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.replace("/admin");
    }
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" size={28} style={{ color: "var(--accent)" }} />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: "var(--accent-soft-bg)" }}
          >
            <ShieldCheck size={26} style={{ color: "var(--accent)" }} />
          </div>
          <h1 className="ks-display text-xl font-bold">Platform admin</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Restricted access — sign in with your admin account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="ks-card space-y-3 p-6">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ks-input"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ks-input"
            />
          </div>

          {error && (
            <p className="text-sm rounded-lg px-3 py-2" style={{ background: "rgba(226,75,74,0.12)", color: "#F29C9C" }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="ks-btn-primary w-full flex items-center justify-center gap-2 mt-2">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
