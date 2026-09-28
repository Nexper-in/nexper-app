"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2 } from "lucide-react";
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
        <div className="flex flex-col items-center mb-6">
          <Image src="/logo-mark.svg" alt="Nexper" width={56} height={56} className="rounded-2xl mb-3" priority />
          <h1 className="ks-display text-2xl font-bold">Nexper</h1>
          <p className="text-sm text-muted mt-1 text-center">
            Billing, inventory &amp; udhaar for your shop
          </p>
        </div>

        <div className="ks-card p-6">
          {mode === "forgot" ? (
            <div className="mb-5">
              <h2 className="ks-display font-bold text-center">Forgot password?</h2>
              <p className="text-xs text-muted text-center mt-1">Enter your email and we&apos;ll send you a reset link.</p>
            </div>
          ) : mode !== "staff" ? (
            <div className="mb-5">
              <h2 className="ks-display font-bold text-center">{mode === "signin" ? "Sign in" : "Create account"}</h2>
            </div>
          ) : (
            <div className="mb-5">
              <h2 className="ks-display font-bold text-center">Staff sign in</h2>
              <p className="text-xs text-muted text-center mt-1">Enter the staff code and PIN your shop owner gave you.</p>
            </div>
          )}

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
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {notice && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
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
      </div>
    </main>
  );
}
