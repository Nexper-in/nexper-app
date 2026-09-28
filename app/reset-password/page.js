"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  // Supabase sends the recovery token in the URL hash on redirect.
  // We need to wait for the session to be established from that hash.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also check if already in recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
      setTimeout(() => router.replace("/dashboard"), 2500);
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <Image src="/logo-mark.svg" alt="Nexper" width={56} height={56} className="rounded-2xl mb-3" priority />
          <h1 className="ks-display text-2xl font-bold">Nexper</h1>
        </div>

        <div className="ks-card p-6">
          {done ? (
            <div className="text-center space-y-3 py-2">
              <CheckCircle2 size={40} className="mx-auto" style={{ color: "#22C55E" }} />
              <p className="font-bold">Password updated!</p>
              <p className="text-sm text-muted">Redirecting you to the dashboard…</p>
            </div>
          ) : !ready ? (
            <div className="text-center space-y-3 py-4">
              <Loader2 size={24} className="animate-spin mx-auto text-brand" />
              <p className="text-sm text-muted">Verifying your reset link…</p>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h2 className="ks-display font-bold text-center">Set new password</h2>
                <p className="text-xs text-muted text-center mt-1">Choose a new password for your account.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">New password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoFocus
                    autoComplete="new-password"
                    className="ks-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Confirm password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="ks-input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Same as above"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || password.length < 6}
                  className="ks-btn-primary w-full flex items-center justify-center gap-2 mt-2"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Update password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
