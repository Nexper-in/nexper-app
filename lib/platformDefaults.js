// What the platform admin page can control, with safe defaults. Shared by the
// browser (reads), the admin API (validates writes) and the database seed.
// If nothing has been saved yet, these values apply, and they match how the app
// behaved before the console existed: everyone is Pro, nothing is blocked.
// Every switchable feature. `plans` says which plan includes it by default.
export const FEATURES = [
  { key: "extra_staff", label: "More than 1 staff login", plans: ["pro"] },
  { key: "purchase_orders", label: "Purchase orders & suppliers", plans: ["pro"] },
  { key: "gstr1_json", label: "GSTR-1 filing export", plans: ["pro"] },
  { key: "ocr_scan", label: "Supplier bill scanning (AI)", plans: ["pro"] },
  { key: "handwritten_scan", label: "Handwritten list to bill (AI)", plans: ["pro"] },
  { key: "product_photos", label: "Product photos", plans: ["pro"] },
  { key: "offers_group", label: "Offers & customer WhatsApp group", plans: ["free", "pro"] },
  { key: "expiry", label: "Expiry tracking screen", plans: ["free", "pro"] },
  { key: "voice_billing", label: "Voice billing", plans: ["free", "pro"] },
  { key: "supplies", label: "Supplies (tea shops, canteens, hotels)", plans: ["pro"] },
  { key: "api_access", label: "Read API", plans: [] },
  { key: "mcp_access", label: "MCP endpoint for AI assistants", plans: [] },
];
export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export const API_SCOPES = ["read:shop", "read:stock", "read:bills", "read:udhaar"];
export const LIMIT_KEYS = ["maxStaff", "aiScansPerMonth"];

export const DEFAULT_SETTINGS = {
  pricing: { monthlyInr: 99, yearlyInr: 899, trialDays: 0 },
  tax: { gstRatePct: 18, pricesIncludeGst: true, sacCode: "998314", legalName: "", gstin: "", address: "" },
  gating: { enforce: false, allowSelfPlanSwitch: true },
  plans: {
    free: { label: "Free", limits: { maxStaff: 1, aiScansPerMonth: 20 }, features: FEATURES.filter((f) => f.plans.includes("free")).map((f) => f.key) },
    pro: { label: "Pro", limits: { maxStaff: 20, aiScansPerMonth: 500 }, features: FEATURES.filter((f) => f.plans.includes("pro")).map((f) => f.key) },
  },
  flags: {}, // feature key -> false switches it off for everyone
  signup: { mode: "open", message: "Nexper is invite-only right now. Ask us for an invite." },
  announcement: { enabled: false, text: "", tone: "info" },
  maintenance: { enabled: false, message: "We're making Nexper better. Back in a few minutes." },
  integrations: { apiEnabled: false, mcpEnabled: false, rateLimitPerMin: 60 },
};
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

const num = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be a number from ${min} to ${max}`);
  return n;
};
const str = (v, max, label) => {
  const s = String(v ?? "").trim();
  if (s.length > max) throw new Error(`${label} is too long (max ${max})`);
  return s;
};
const bool = (v) => v === true || v === "true";

// Checks and cleans one setting before it is saved. Unknown fields are dropped,
// so a bad request can't store anything else. Throws Error with a plain message.
export function normalizeSetting(key, value) {
  const v = value && typeof value === "object" ? value : {};
  switch (key) {
    case "pricing":
      return {
        monthlyInr: Math.round(num(v.monthlyInr, 0, 100000, "Monthly price")),
        yearlyInr: Math.round(num(v.yearlyInr, 0, 1000000, "Yearly price")),
        trialDays: Math.round(num(v.trialDays ?? 0, 0, 365, "Trial days")),
      };
    case "tax": {
      const gstin = str(v.gstin, 15, "GSTIN").toUpperCase();
      if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) throw new Error("That GSTIN doesn't look right");
      return {
        gstRatePct: num(v.gstRatePct, 0, 40, "GST rate"),
        pricesIncludeGst: bool(v.pricesIncludeGst),
        sacCode: str(v.sacCode, 10, "SAC code"),
        legalName: str(v.legalName, 120, "Legal name"),
        gstin,
        address: str(v.address, 300, "Address"),
      };
    }
    case "gating":
      return { enforce: bool(v.enforce), allowSelfPlanSwitch: bool(v.allowSelfPlanSwitch) };
    case "plans": {
      const out = {};
      for (const plan of ["free", "pro"]) {
        const p = v[plan] || {};
        out[plan] = {
          label: str(p.label || plan, 30, "Plan name") || plan,
          limits: {
            maxStaff: Math.round(num(p.limits?.maxStaff ?? 1, 0, 1000, "Staff limit")),
            aiScansPerMonth: Math.round(num(p.limits?.aiScansPerMonth ?? 0, 0, 100000, "AI scans per month")),
          },
          features: (Array.isArray(p.features) ? p.features : []).filter((k) => FEATURE_KEYS.includes(k)),
        };
      }
      return out;
    }
    case "flags":
      return Object.fromEntries(Object.entries(v).filter(([k, val]) => FEATURE_KEYS.includes(k) && val === false).map(([k]) => [k, false]));
    case "signup": {
      if (!["open", "invite_only", "closed"].includes(v.mode)) throw new Error("Sign-up mode must be open, invite only or closed");
      return { mode: v.mode, message: str(v.message, 200, "Message") };
    }
    case "announcement":
      return { enabled: bool(v.enabled), text: str(v.text, 240, "Announcement"), tone: ["info", "warn"].includes(v.tone) ? v.tone : "info" };
    case "maintenance":
      return { enabled: bool(v.enabled), message: str(v.message, 240, "Message") };
    case "integrations":
      return { apiEnabled: bool(v.apiEnabled), mcpEnabled: bool(v.mcpEnabled), rateLimitPerMin: Math.round(num(v.rateLimitPerMin ?? 60, 1, 6000, "Rate limit")) };
    default:
      throw new Error("Unknown setting");
  }
}

// Rows from platform_settings -> one object, with defaults for anything unset.
export function mergeSettings(rows) {
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const r of rows || []) {
    if (!(r.key in out)) continue;
    try {
      out[r.key] = normalizeSetting(r.key, r.value);
    } catch {
      /* a bad stored value falls back to the default */
    }
  }
  return out;
}

// Per-tenant controls, cleaned.
export function normalizeControls(v = {}) {
  const limits = {};
  for (const k of LIMIT_KEYS) {
    if (v.limits?.[k] !== undefined && v.limits[k] !== null && v.limits[k] !== "") limits[k] = Math.round(num(v.limits[k], 0, 100000, k));
  }
  const overrides = {};
  for (const k of FEATURE_KEYS) if (typeof v.feature_overrides?.[k] === "boolean") overrides[k] = v.feature_overrides[k];
  const expires = v.plan_expires_at ? new Date(v.plan_expires_at) : null;
  if (expires && Number.isNaN(expires.getTime())) throw new Error("Plan end date is not a date");
  return {
    plan: v.plan === "free" || v.plan === "pro" ? v.plan : null,
    plan_expires_at: expires ? expires.toISOString() : null,
    limits,
    feature_overrides: overrides,
    api_enabled: bool(v.api_enabled),
    mcp_enabled: bool(v.mcp_enabled),
    notes: str(v.notes, 500, "Notes") || null,
  };
}
