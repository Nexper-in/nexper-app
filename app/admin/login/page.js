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
  // password -> (verify | enroll): the authenticator-app step platform admins must pass.
  const [step, setStep] = useState("password");
  const [factorId, setFactorId] = useState("");
  const [enroll, setEnroll] = useState(null); // { qr, secret }
  const [code, setCode] = useState("");

  useEffect(() => {
    delete document.documentElement.dataset.theme; // admin always uses Night
    return () => {
      applyTheme(readTheme());
    };
  }, []);

  // After the password: if the authenticator step is already done go on, otherwise ask for the
  // code (a factor exists) or set one up (none yet).
  async function afterPassword() {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") {
      router.replace("/admin");
      return;
    }
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) throw listError;
    const verified = factors?.totp?.[0];
    if (verified) {
      setFactorId(verified.id);
      setStep("verify");
      return;
    }
    // Clear half-finished attempts, then start a new one.
    for (const f of factors?.all || []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Nexper admin ${new Date().toISOString().slice(0, 10)}` });
    if (enrollError) throw enrollError;
    setFactorId(data.id);
    setEnroll({ qr: data.totp.qr_code, secret: data.totp.secret });
    setStep("enroll");
  }

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!session) return setCheckingSession(false);
        try {
          await afterPassword();
        } catch (e) {
          setError(e.message);
        }
        setCheckingSession(false);
      })
      .catch(() => setCheckingSession(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router]);

  async function handleCode(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }
    router.replace("/admin");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    try {
      await afterPassword();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
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

        {step !== "password" ? (
          <form onSubmit={handleCode} className="ks-card space-y-3 p-6">
            {step === "enroll" && enroll && (
              <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                <p>
                  First time here: set up two-step sign-in. Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password...), scan this code, then type the 6 digits it shows.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enroll.qr} alt="Authenticator setup code" className="mx-auto bg-white rounded-lg p-2" width={176} height={176} />
                <p className="text-xs break-all">Cannot scan? Enter this key by hand: <span style={{ color: "var(--text-primary)" }}>{enroll.secret}</span></p>
              </div>
            )}
            {step === "verify" && (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Enter the 6-digit code from your authenticator app.</p>
            )}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="ks-input text-center tracking-widest"
              placeholder="123456"
            />
            {error && (
              <p className="text-sm rounded-lg px-3 py-2" style={{ background: "rgba(226,75,74,0.12)", color: "#F29C9C" }}>{error}</p>
            )}
            <button type="submit" disabled={loading || code.length !== 6} className="ks-btn-primary w-full flex items-center justify-center gap-2">
              {loading && <Loader2 size={16} className="animate-spin" />}
              {step === "enroll" ? "Turn on and sign in" : "Verify"}
            </button>
            <button type="button" onClick={async () => { await supabase.auth.signOut(); setStep("password"); setCode(""); setError(""); }} className="text-xs w-full text-center" style={{ color: "var(--text-secondary)" }}>
              Use a different account
            </button>
          </form>
        ) : (
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
        )}
      </div>
    </main>
  );
}
