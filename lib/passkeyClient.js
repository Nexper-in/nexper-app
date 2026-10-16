import { startRegistration, startAuthentication, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";
import { callApi } from "@/lib/apiClient";

// Browser side of sign-in with fingerprint, Face ID or a passkey.

export const passkeysSupported = () => typeof window !== "undefined" && browserSupportsWebAuthn();

// Does this phone or laptop have a fingerprint reader, Face ID or a screen lock
// that can stand in for one?
export async function deviceHasBiometric() {
  try {
    return passkeysSupported() && (await platformAuthenticatorIsAvailable());
  } catch {
    return false;
  }
}

// A short name for the "Add this device" box, from what the browser tells us.
export function guessDeviceName() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Windows/.test(ua)) return "Windows computer";
  if (/Mac OS X|Macintosh/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux computer";
  return "This device";
}

// Turns what the browser throws into words for the person, or null when they
// simply closed the fingerprint prompt (nothing to say).
export function passkeyErrorText(e, t) {
  if (!e) return t("Something went wrong. Try again.");
  if (e.name === "NotAllowedError" || e.name === "AbortError") return null;
  if (e.name === "InvalidStateError") return t("This device is already added.");
  if (e.name === "NotSupportedError") return t("This phone or browser can't do that.");
  return e.message || t("Something went wrong. Try again.");
}

async function postJson(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

// Sign in without typing: the phone asks for the fingerprint or face, we check
// the proof on the server, and trade the one-time token for a normal session.
export async function signInWithPasskey(supabase) {
  const { options, challengeId } = await postJson("/api/passkeys/login/options");
  const response = await startAuthentication({ optionsJSON: options });
  const { token_hash } = await postJson("/api/passkeys/login/verify", { challengeId, response });
  let result = await supabase.auth.verifyOtp({ token_hash, type: "email" });
  if (result.error) result = await supabase.auth.verifyOtp({ token_hash, type: "magiclink" });
  if (result.error) throw result.error;
  try {
    localStorage.setItem("nexper.passkey.used", "1");
    sessionStorage.setItem("nexper.active.at", String(Date.now()));
  } catch {}
}

// Add this device for the signed-in user.
export async function addPasskey(supabase, name) {
  const { options, challengeId } = await callApi(supabase, "/api/passkeys/register/options", {});
  const response = await startRegistration({ optionsJSON: options });
  const out = await callApi(supabase, "/api/passkeys/register/verify", { challengeId, response, name });
  try {
    localStorage.setItem("nexper.passkey.used", "1");
  } catch {}
  return out.passkey;
}

export async function listPasskeys(supabase) {
  const json = await callApi(supabase, "/api/passkeys", null, "GET");
  return json.passkeys || [];
}

export async function removePasskey(supabase, id) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/passkeys", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed");
}
