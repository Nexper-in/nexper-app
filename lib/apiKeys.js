import { createHash, randomBytes } from "crypto";

// Keys look like nxp_<32 random characters>. Only a SHA-256 hash is stored, so
// a database leak does not leak working keys, and the full key is shown once.
// (SHA-256 is right here: the key is 192 random bits, not a human password.)
export function generateApiKey() {
  const key = "nxp_" + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) };
}

export function hashApiKey(key) {
  return createHash("sha256").update(String(key)).digest("hex");
}

export function looksLikeApiKey(key) {
  return typeof key === "string" && /^nxp_[A-Za-z0-9_-]{32}$/.test(key);
}
