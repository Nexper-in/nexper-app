"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { useT } from "@/lib/i18n";
import LanguagePicker from "@/components/LanguagePicker";

// Google sign-in is built but off until it's set up in Supabase and
// Google Cloud: the button shows with a "Soon" label and does nothing, and
// the email form is open below it. Turn it on by setting
// NEXT_PUBLIC_GOOGLE_SIGNIN=true in Vercel and redeploying; then the button
// works and the email form folds behind a link.
const GOOGLE_SIGNIN = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "true";
// When the Google client ID is set, Google's own button signs people in right
// on this page (a popup that says "Nexper" and our address) and the result is
// handed to Supabase. Without it, or if Google's script can't load, the
// redirect button below is used and Google shows the Supabase address.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
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
  const [showEmail, setShowEmail] = useState(!GOOGLE_SIGNIN);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const gisBox = useRef(null);
  // Sign-up mode from the platform admin page: open, invite_only or closed.
  const [signup, setSignup] = useState({ mode: "open", message: "" });

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "signup")
      .maybeSingle()
      .then(({ data }) => data?.value?.mode && setSignup({ mode: data.value.mode, message: data.value.message || "" }));
  }, [supabase]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("mode");
    if (requested === "signup" || requested === "staff") setMode(requested);
    const oauthError = new URLSearchParams(window.location.search).get("error");
    // Never print text taken from the address bar: anyone could craft a link
    // with a fake "call this number" message. Show our own wording instead.
    if (oauthError) setError(t("Sign-in didn't finish. Please try again."));
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

  // Google's own sign-in button (see GOOGLE_CLIENT_ID above).
  useEffect(() => {
    if (!GOOGLE_SIGNIN || !GOOGLE_CLIENT_ID || checkingSession || mode === "staff" || mode === "forgot") {
      setGisReady(false);
      return;
    }
    let cancelled = false;
    const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    async function start() {
      try {
        const raw = toHex(crypto.getRandomValues(new Uint8Array(16)));
        const hashed = toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
        const g = window.google?.accounts?.id;
        if (cancelled || !g || !gisBox.current) return;
        g.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: hashed,
          ux_mode: "popup",
          auto_select: false,
          callback: async (resp) => {
            setError("");
            setGoogleLoading(true);
            const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: resp.credential, nonce: raw });
            if (error) {
              setError(error.message || t("Couldn't start Google sign-in"));
              setShowEmail(true);
              setGoogleLoading(false);
            } else {
              router.replace("/dashboard");
            }
          },
        });
        gisBox.current.innerHTML = "";
        g.renderButton(gisBox.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "center",
          width: Math.max(200, Math.min(400, gisBox.current.offsetWidth || 320)),
        });
        setGisReady(true);
      } catch {
        setGisReady(false);
      }
    }
    if (window.google?.accounts?.id) {
      start();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = start;
      script.onerror = () => setGisReady(false);
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
    };
  }, [supabase, router, checkingSession, mode]);

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
        throw new Error(t("Google sign-in isn't switched on yet. Please use email for now."));
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message || t("Couldn't start Google sign-in"));
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
      else setNotice(t("Password reset link sent! Check your email and follow the link to set a new password."));
      setLoading(false);
      return;
    }

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.replace("/dashboard");
    } else if (mode === "signup") {
      if (signup.mode === "closed") {
        setError(signup.message || t("New sign-ups are closed right now."));
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) setError(error.message);
      else if (data.session) router.replace("/dashboard");
      else setNotice(t("Check your email to confirm your account, then sign in."));
    } else {
      try {
        const res = await fetch("/api/staff/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staffCode }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || t("Couldn't find that staff code"));
        const { error } = await supabase.auth.signInWithPassword({ email: json.email, password: pin });
        if (error) setError(t("Incorrect PIN"));
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
      <div className="fixed top-3 right-3 z-30">
        <LanguagePicker />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-7">
          <a href="https://nexper.in" className="ks-wordmark text-[44px]" aria-label="Nexper home">
            Ne<span className="ks-grad-text">x</span>per
          </a>
          <p className="text-sm text-muted mt-2 text-center">{t("Dukaan ka hisaab, ab phone pe.")}</p>
        </div>

        <div className="ks-card p-6">
          {mode === "forgot" ? (
            <div className="mb-5">
              <h2 className="ks-display font-bold text-center">{t("Forgot password?")}</h2>
              <p className="text-xs text-muted text-center mt-1">{t("Enter your email and we'll send you a reset link.")}</p>
            </div>
          ) : mode !== "staff" ? (
            <div className="mb-5">
              <h2 className="ks-display font-bold text-center">{mode === "signin" ? t("Sign in to your shop") : t("Create your shop account")}</h2>
              <>
              {GOOGLE_SIGNIN && GOOGLE_CLIENT_ID && (
                <div className="mt-5 flex justify-center" style={gisReady ? undefined : { display: "none" }}>
                  <div ref={gisBox} className="w-full flex justify-center" style={{ opacity: googleLoading ? 0.5 : 1, pointerEvents: googleLoading ? "none" : undefined }} />
                </div>
              )}
              <button
                type="button"
                hidden={gisReady}
                onClick={GOOGLE_SIGNIN ? handleGoogle : undefined}
                disabled={googleLoading}
                aria-disabled={!GOOGLE_SIGNIN}
                title={GOOGLE_SIGNIN ? undefined : t("Google sign-in is coming soon")}
                className={`mt-5 w-full flex items-center justify-center gap-2.5 rounded-xl py-3 text-[15px] font-semibold transition-transform disabled:opacity-60 ${
                  GOOGLE_SIGNIN ? "active:scale-[.98]" : "cursor-default"
                }`}
                style={{ background: "#ffffff", color: "#1f1f1f", border: "1px solid var(--border-strong)", opacity: GOOGLE_SIGNIN ? 1 : 0.7 }}
              >
                {googleLoading ? <Loader2 size={18} className="animate-spin" /> : <GoogleMark />}
                {t("Continue with Google")}
                {!GOOGLE_SIGNIN && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#efeaff", color: "#5b3be0" }}>
                    {t("Soon")}
                  </span>
                )}
              </button>
              {!showEmail && (
                <button
                  type="button"
                  onClick={() => setShowEmail(true)}
                  className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Mail size={15} /> {mode === "signin" ? t("Sign in with email instead") : t("Use email instead")}
                </button>
              )}
              {showEmail && (
                <div className="flex items-center gap-3 mt-5 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  {t("or with email")}
                  <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
                </div>
              )}
              {!showEmail && error && (
                <p className="text-sm ks-note-err rounded-lg px-3 py-2 mt-3">{error}</p>
              )}
              </>
            </div>
          ) : (
            <div className="mb-5">
              <h2 className="ks-display font-bold text-center">{t("Staff sign in")}</h2>
              <p className="text-xs text-muted text-center mt-1">{t("Enter the staff code and PIN your shop owner gave you.")}</p>
            </div>
          )}

          {mode === "signup" && signup.mode !== "open" && (
            <p className="text-xs rounded-lg px-3 py-2 mb-3" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
              {signup.message || (signup.mode === "invite_only" ? t("Nexper is invite-only right now. Sign up with the email you were invited on.") : t("New sign-ups are closed right now."))}
            </p>
          )}

          {(showEmail || mode === "staff" || mode === "forgot") && (
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">{t("Your name")}</label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  className="ks-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("e.g. Suresh Sharma")}
                />
              </div>
            )}

            {mode === "forgot" ? (
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">{t("Email")}</label>
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
                  <label className="text-xs font-medium text-muted mb-1 block">{t("Email")}</label>
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
                    <label className="text-xs font-medium text-muted">{t("Password")}</label>
                    {mode === "signin" && (
                      <button type="button" onClick={() => switchMode("forgot")} className="text-xs font-semibold text-brand">
                        {t("Forgot password?")}
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
                  <label className="text-xs font-medium text-muted mb-1 block">{t("Staff code")}</label>
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
                  <label className="text-xs font-medium text-muted mb-1 block">{t("PIN")}</label>
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
                {mode === "signin" ? t("Sign in") : mode === "signup" ? t("Create account") : mode === "forgot" ? t("Send reset link") : t("Sign in")}
              </button>
            )}
          </form>
          )}
        </div>

        {mode === "forgot" ? (
          <p className="text-center text-xs text-muted mt-4">
            <button type="button" onClick={() => switchMode("signin")} className="font-semibold text-brand">
              {t("Back to sign in")}
            </button>
          </p>
        ) : mode !== "staff" ? (
          <div className="text-center text-xs text-muted mt-4 space-y-1.5">
            <p>
              {mode === "signin" ? t("New here?") : t("Already have an account?")}{" "}
              <button type="button" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")} className="font-semibold text-brand">
                {mode === "signin" ? t("Create an account") : t("Sign in")}
              </button>
            </p>
            <p>
              {t("Work at a shop?")}{" "}
              <button type="button" onClick={() => switchMode("staff")} className="font-semibold text-brand">
                {t("Staff sign in")}
              </button>
            </p>
          </div>
        ) : (
          <p className="text-center text-xs text-muted mt-4">
            <button type="button" onClick={() => switchMode("signin")} className="font-semibold text-brand">
              {t("Back to owner sign in")}
            </button>
          </p>
        )}

        <p className="text-center text-[11px] text-muted mt-6">
          {t("By continuing you agree to our")}{" "}
          <a href="https://nexper.in/terms/" className="underline">
            {t("Terms")}
          </a>{" "}
          {t("and")}{" "}
          <a href="https://nexper.in/privacy/" className="underline">
            {t("Privacy policy")}
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
