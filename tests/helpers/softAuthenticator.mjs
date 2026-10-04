// A software fingerprint reader for tests: it makes real WebAuthn answers (a P-256
// key pair, signed challenges, the same byte layout a phone produces) so the
// server's checks run against the genuine format instead of mocks.
import crypto from "node:crypto";

const b64u = (b) => Buffer.from(b).toString("base64url");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest();

function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
}
function cbor(v) {
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === "string") {
    const b = Buffer.from(v);
    return Buffer.concat([head(3, b.length), b]);
  }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, val]) => [cbor(k), cbor(val)])]);
  throw new Error("cbor: unsupported " + typeof v);
}

export class SoftAuthenticator {
  constructor({ rpID, origin, userVerified = true, counter = 0, userHandle = null } = {}) {
    this.rpID = rpID;
    this.origin = origin;
    this.uv = userVerified;
    this.counter = counter;
    this.userHandle = userHandle;
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = privateKey;
    this.jwk = publicKey.export({ format: "jwk" });
    this.credentialId = crypto.randomBytes(32);
  }

  get id() {
    return b64u(this.credentialId);
  }

  flags(extra = 0) {
    return 0x01 | (this.uv ? 0x04 : 0) | extra;
  }

  // What the browser's navigator.credentials.create() would return.
  create(options, { origin = this.origin, challenge = options.challenge } = {}) {
    // The browser keeps the account id the server chose (bytes) and returns it when signing in.
    if (options.user?.id) this.userHandle = Buffer.from(options.user.id, "base64url");
    const coseKey = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(this.jwk.x, "base64url")], [-3, Buffer.from(this.jwk.y, "base64url")]]);
    const credLen = Buffer.alloc(2);
    credLen.writeUInt16BE(this.credentialId.length);
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha256(this.rpID), Buffer.from([this.flags(0x40)]), counter, Buffer.alloc(16), credLen, this.credentialId, cbor(coseKey)]);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge, origin, crossOrigin: false }));
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: b64u(clientDataJSON),
        attestationObject: b64u(cbor(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]))),
        transports: ["internal"],
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
  }

  // What navigator.credentials.get() would return.
  get(options, { origin = this.origin, challenge = options.challenge, rpID = this.rpID, signWith = this.privateKey, bumpCounter = true } = {}) {
    if (bumpCounter) this.counter++;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha256(rpID), Buffer.from([this.flags()]), counter]);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }));
    const signature = crypto.sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), signWith);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        userHandle: this.userHandle ? b64u(this.userHandle) : undefined,
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
  }
}

export const otherKey = () => crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
