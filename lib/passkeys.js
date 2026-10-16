// Server side of "sign in with fingerprint, Face ID or a passkey" (WebAuthn).
//
// The device proves it holds the private key by signing a one-time challenge; we
// check that signature against the public key we stored, and only then ask the
// auth service for a one-time sign-in token. Everything here takes the database
// client as an argument, so it is tested without a network.
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

export const RP_NAME = "Nexper";
export const MAX_PASSKEYS_PER_USER = 10;
const CHALLENGE_MS = 5 * 60 * 1000;

export class PasskeyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const toB64u = (bytes) => Buffer.from(bytes).toString("base64url");
export const fromB64u = (s) => new Uint8Array(Buffer.from(String(s), "base64url"));

// A passkey belongs to one exact site. Work out which one this request is for,
// and refuse hosts that are not ours. When NEXT_PUBLIC_APP_URL is set only that
// host (plus localhost for development) is accepted.
export function resolveRp(headers, appUrl = process.env.NEXT_PUBLIC_APP_URL) {
  const raw = (headers.get("x-forwarded-host") || headers.get("host") || "").split(",")[0].trim().toLowerCase();
  const hostname = raw.replace(/:\d+$/, "");
  if (!hostname) return null;
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  let allowed = local;
  if (!allowed) {
    if (appUrl) {
      try {
        allowed = new URL(appUrl).hostname.toLowerCase() === hostname;
      } catch {
        allowed = false;
      }
    } else {
      allowed = hostname === "nexper.in" || hostname.endsWith(".nexper.in");
    }
  }
  if (!allowed) return null;
  const proto = local ? (headers.get("x-forwarded-proto") || "http").split(",")[0].trim() : "https";
  return { rpID: hostname, origin: `${proto}://${raw}`, rpName: RP_NAME };
}

async function saveChallenge(admin, { challenge, kind, userId = null }) {
  await admin.from("passkey_challenges").delete().lt("expires_at", new Date().toISOString());
  const { data, error } = await admin
    .from("passkey_challenges")
    .insert({ challenge, kind, user_id: userId, expires_at: new Date(Date.now() + CHALLENGE_MS).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// One use only: reading it deletes it.
async function takeChallenge(admin, id, kind) {
  if (typeof id !== "string" || id.length > 64) return null;
  const { data } = await admin.from("passkey_challenges").delete().eq("id", id).eq("kind", kind).select().maybeSingle();
  if (!data || new Date(data.expires_at) < new Date()) return null;
  return data;
}

const cleanName = (name) => {
  const n = String(name || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);
  return n || "This device";
};

// ---------- adding a passkey (the user is already signed in) ----------
export async function registrationOptions({ admin, user, rp }) {
  const { data: existing, error } = await admin.from("passkeys").select("credential_id, transports").eq("user_id", user.id);
  if (error) throw error;
  if ((existing || []).length >= MAX_PASSKEYS_PER_USER) throw new PasskeyError("You have added the most devices allowed. Remove one first.");
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: user.email || user.id,
    userDisplayName: user.user_metadata?.full_name || user.email || "Nexper user",
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: (existing || []).map((c) => ({ id: c.credential_id, transports: c.transports || undefined })),
    // Keep the key on the device and require the fingerprint / face / screen lock.
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const challengeId = await saveChallenge(admin, { challenge: options.challenge, kind: "register", userId: user.id });
  return { options, challengeId };
}

export async function registrationVerify({ admin, user, rp, challengeId, response, name }) {
  const ch = await takeChallenge(admin, challengeId, "register");
  if (!ch || ch.user_id !== user.id) throw new PasskeyError("That took too long. Please try again.");
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new PasskeyError("We couldn't verify that device. Please try again.");
  }
  if (!verification.verified || !verification.registrationInfo) throw new PasskeyError("We couldn't verify that device. Please try again.");
  const info = verification.registrationInfo;
  const credential = info.credential;
  const row = {
    user_id: user.id,
    credential_id: credential.id,
    public_key: toB64u(credential.publicKey),
    counter: credential.counter || 0,
    transports: credential.transports || response?.response?.transports || null,
    device_type: info.credentialDeviceType || null,
    backed_up: info.credentialBackedUp ?? null,
    name: cleanName(name),
  };
  const { data, error } = await admin.from("passkeys").insert(row).select("id, name, created_at").single();
  if (error) {
    if (error.code === "23505") throw new PasskeyError("That device is already added.", 409);
    throw error;
  }
  return data;
}

// ---------- signing in with a passkey (nobody is signed in yet) ----------
export async function loginOptions({ admin, rp }) {
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required", allowCredentials: [] });
  const challengeId = await saveChallenge(admin, { challenge: options.challenge, kind: "login" });
  return { options, challengeId };
}

// Returns { userId, tokenHash }. The caller hands tokenHash to the browser,
// which trades it for a normal session.
export async function loginVerify({ admin, rp, challengeId, response }) {
  const deny = () => new PasskeyError("We couldn't sign you in with that. Use your email and password.", 401);
  const ch = await takeChallenge(admin, challengeId, "login");
  if (!ch) throw new PasskeyError("That took too long. Please try again.");
  const credentialId = typeof response?.id === "string" ? response.id : "";
  const { data: row } = await admin.from("passkeys").select("*").eq("credential_id", credentialId).maybeSingle();
  if (!row) throw deny();
  // The device also reports which account the key was made for; it must match.
  const handle = response?.response?.userHandle;
  if (handle && Buffer.from(String(handle), "base64url").toString("utf8") !== row.user_id) throw deny();

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: { id: row.credential_id, publicKey: fromB64u(row.public_key), counter: Number(row.counter || 0), transports: row.transports || undefined },
      requireUserVerification: true,
    });
  } catch {
    throw deny();
  }
  if (!verification.verified) throw deny();

  await admin
    .from("passkeys")
    .update({ counter: Math.max(Number(row.counter || 0), verification.authenticationInfo.newCounter || 0), last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  const { data: userData } = await admin.auth.admin.getUserById(row.user_id);
  const authUser = userData?.user;
  if (!authUser?.email) throw deny();
  // A suspended account must not get back in through a passkey.
  if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) throw new PasskeyError("This account is switched off. Please contact support.", 403);

  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: authUser.email });
  const tokenHash = link?.properties?.hashed_token;
  if (error || !tokenHash) throw error || new Error("no token");
  return { userId: row.user_id, tokenHash };
}
