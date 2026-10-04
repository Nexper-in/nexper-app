// App lock: ask for fingerprint, Face ID or the screen lock when Nexper opens or
// comes back after being away. This protects a phone that someone else picks up.
// It lives on the device (nothing is sent to a server), so it also works with no
// internet. It is a lock on the screen, not on the account: signing in on
// another device is still done with the password or a passkey.

const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const key = (userId) => `nexper.applock.${userId}`;
const ACTIVE_KEY = "nexper.active.at"; // sessionStorage: the last time the app was in use

export const LOCK_DELAYS = [0, 1, 5, 15]; // minutes away before it asks again

export function getLockConfig(userId) {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    return cfg && typeof cfg.credentialId === "string" ? { minutes: LOCK_DELAYS.includes(cfg.minutes) ? cfg.minutes : 1, credentialId: cfg.credentialId } : null;
  } catch {
    return null;
  }
}

function saveLockConfig(userId, cfg) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(cfg));
  } catch {}
  window.dispatchEvent(new Event("nexper:applock-changed"));
}

export function setLockMinutes(userId, minutes) {
  const cfg = getLockConfig(userId);
  if (cfg && LOCK_DELAYS.includes(minutes)) saveLockConfig(userId, { ...cfg, minutes });
}

export function disableLock(userId) {
  try {
    localStorage.removeItem(key(userId));
  } catch {}
  window.dispatchEvent(new Event("nexper:applock-changed"));
}

export function markActive() {
  try {
    sessionStorage.setItem(ACTIVE_KEY, String(Date.now()));
  } catch {}
}
export function lastActive() {
  try {
    return Number(sessionStorage.getItem(ACTIVE_KEY) || 0);
  } catch {
    return 0;
  }
}

// Should the app be locked right now? Yes if it was away longer than the delay,
// or this is a fresh start (nothing recorded).
export function shouldLock(cfg, now = Date.now(), last = lastActive()) {
  if (!cfg) return false;
  if (!last) return true;
  return now - last >= cfg.minutes * 60000;
}

const challenge = () => crypto.getRandomValues(new Uint8Array(32));

// Make a key on this device that only the fingerprint / face / screen lock can use.
export async function enableLock(user, minutes = 1) {
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: "Nexper", id: window.location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: user.email || user.id, displayName: user.user_metadata?.full_name || user.email || "Nexper" },
      challenge: challenge(),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      attestation: "none",
      timeout: 60000,
    },
  });
  if (!cred) throw new Error("cancelled");
  saveLockConfig(user.id, { credentialId: b64u(cred.rawId), minutes });
  markActive();
}

// True when the person proved who they are.
export async function unlock(cfg) {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge(),
        rpId: window.location.hostname,
        allowCredentials: [{ type: "public-key", id: fromB64u(cfg.credentialId), transports: ["internal"] }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    if (assertion) markActive();
    return Boolean(assertion);
  } catch {
    return false;
  }
}
