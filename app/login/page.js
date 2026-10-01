"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "staff" | "forgot"
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  // Owners sign in with Google; the email form is a fallback that stays
  // folded away unless asked for (or a ?mode= link points at it).
  const [showEmail, setShowEmail] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("mode");
    if (requested === "signup" || requested === "staff") setMode(requested);
    const oauthError = new URLSearchParams(window.location.search).get("error");
    if (oauthError) setError(oauthError);
  }, []);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session) router.replace("/dashboard");
        else setCheckingSession(false);
      })
      .catch(() => setCheckingSession(false));
  }, [supabase, router]);

  function switchMode(next) {
    setMode(next);
    setError("");
    setNotice("");
  }

  async function handleGoogle() {
    setError("");
    setGoogleLoading(true);
    try {
      // Ask Supabase first whether Google is switched on, so an owner never
      // lands on a raw "provider is not enabled" error page.
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const res = await fetch(`${base}/auth/v1/settings`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      });
      const settings = res.ok ? await res.json() : null;
      if (settings && !settings.external?.google) {
        throw new Error("Google sign-in isn't switched on yet. Please use email for now.");
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message || "Couldn't start Google sign-in");
      setShowEmail(true);
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) setError(error.message);
      else setNotice("Password reset link sent! Check your email and follow the link to set a new password.");
      setLoading(false);
      return;
    }

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.replace("/dashboard");
    } else if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) setError(error.message);
      else if (data.session) router.replace("/dashboard");
      else setNotice("Check your email to confirm your account, then sign in.");
    } else {
      try {
        const res = await fetch("/api/staff/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staffCode }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Couldn't find that staff code");
        const { error } = await supabase.auth.signInWithPassword({ email: json.email, password: pin });
        if (error) setError("Incorrect PIN");
        else router.replace("/dashboard");
      } catch (err) {
        setError(err.message);
      }
    }
    setLoading(false);
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-brand" size={28} />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-7">
          <a href="https://nexper.in" className="ks-wordmark text-[44px]" aria-label="Nexper home">
            Ne<span className="ks-grad-text">x</span>per
          </a>
          <p className="text-sm text-muted mt-2 text-center">Dukaan ka hisaab, ab phone pe.</p>
        </div>

        <div className="ks-card p-6">
          {mode === "forgot" ? (
            <div className="mb-5">
              <h2 className="ks-display font-bold text-center">Forgot password?</h2>
              <p className="text-xs text-muted text-center mt-1">Enter your email and we&apos;ll send you a reset link.</p>
            </div>
          ) : mode !== "staff" ? (
            <div className="mb-5">
              <h2 className="ks-display font-bold text-center">{mode === "signin" ? "Sign in to your shop" : "Create your shop account"}</h2>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading}
                className="mt-5 w-full flex items-center justify-center gap-2.5 rounded-xl py-3 text-[15px] font-semibold transition-transform active:scale-[.98] disabled:opacity-60"
                style={{ background: "#ffffff", color: "#1f1f1f", border: "1px solid var(--border-strong)" }}
              >
                {googleLoading ? <Loader2 size={18} className="animate-spin" /> : <GoogleMark />}
                Continue with Google
              </button>
              {!showEmail && (
                <button
                  type="button"
                  onClick={() => setShowEmail(true)}
                  className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Mail size={15} /> {mode === "signin" ? "Sign in with email instead" : "Use email instead"}
                </button>
              )}
              {showEmail && (
                <div className="flex items-center gap-3 mt-5 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  or with email
                  <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
                </div>
              )}
              {!showEmail && error && (
                <p className="text-sm ks-note-err rounded-lg px-3 py-2 mt-3">{error}</p>
              )}
            </div>
          ) : (
            <div className="mb-5">
              <h2 className="ks-display font-bold text-center">Staff sign in</h2>
              <p className="text-xs text-muted text-center mt-1">Enter the staff code and PIN your shop owner gave you.</p>
            </div>
          )}

          {(showEmail || mode === "staff" || mode === "forgot") && (
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Your name</label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  className="ks-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Suresh Sharma"
                />
              </div>
            )}

            {mode === "forgot" ? (
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Email</label>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  className="ks-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@shop.com"
                />
              </div>
            ) : mode !== "staff" ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Email</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    className="ks-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@shop.com"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-muted">Password</label>
                    {mode === "signin" && (
                      <button type="button" onClick={() => switchMode("forgot")} className="text-xs font-semibold text-brand">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    className="ks-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Staff code</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    className="ks-input ks-mono text-center tracking-widest"
                    value={staffCode}
                    onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">PIN</label>
                  <input
                    type="password"
                    required
                    inputMode="numeric"
                    minLength={6}
                    className="ks-input ks-mono text-center tracking-widest"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                  />
                </div>
              </>
            )}

            {error && (
              <p className="text-sm ks-note-err rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {notice && (
              <p className="text-sm ks-note-ok rounded-lg px-3 py-2">
                {notice}
              </p>
            )}

            {!notice && (
              <button
                type="submit"
                disabled={loading}
                className="ks-btn-primary w-full flex items-center justify-center gap-2 mt-2"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
              </button>
            )}
          </form>
          )}
        </div>

        {mode === "forgot" ? (
          <p className="text-center text-xs text-muted mt-4">
            <button type="button" onClick={() => switchMode("signin")} className="font-semibold text-brand">
              Back to sign in
            </button>
          </p>
        ) : mode !== "staff" ? (
          <div className="text-center text-xs text-muted mt-4 space-y-1.5">
            <p>
              {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
              <button type="button" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")} className="font-semibold text-brand">
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
            <p>
              Work at a shop?{" "}
              <button type="button" onClick={() => switchMode("staff")} className="font-semibold text-brand">
                Staff sign in
              </button>
            </p>
          </div>
        ) : (
          <p className="text-center text-xs text-muted mt-4">
            <button type="button" onClick={() => switchMode("signin")} className="font-semibold text-brand">
              Back to owner sign in
            </button>
          </p>
        )}

        <p className="text-center text-[11px] text-muted mt-6">
          By continuing you agree to our{" "}
          <a href="https://nexper.in/terms/" className="underline">
            Terms
          </a>{" "}
          and{" "}
          <a href="https://nexper.in/privacy/" className="underline">
            Privacy policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
