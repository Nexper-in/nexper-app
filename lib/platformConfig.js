// The live platform configuration (prices, plans, switches) as the browser sees
// it. ShopContext loads it from platform_settings and calls setPlatformConfig;
// everything else asks through these functions, so a screen never needs to know
// where the numbers come from.
import { DEFAULT_SETTINGS, mergeSettings } from "@/lib/platformDefaults";

let CONFIG = DEFAULT_SETTINGS;

export function setPlatformConfig(rows) {
  CONFIG = mergeSettings(rows);
  return CONFIG;
}
export function getPlatformConfig() {
  return CONFIG;
}

// A "tenant view" is the shop row plus its two layers of admin controls:
//   { ...shop, controls (per-shop support override), orgControls (the company's plan) }
// Order, for plan, features and limits alike: the shop's own override, then the company's,
// then (plan only) the shop's legacy plan field, then free. Each level lapses on its end date.
const lapsed = (c) => Boolean(c?.plan_expires_at && new Date(c.plan_expires_at) < new Date());

// The plan a tenant is on right now.
export function planOf(shop) {
  const own = shop?.controls;
  if (own?.plan) return lapsed(own) ? "free" : own.plan;
  const co = shop?.orgControls;
  if (co?.plan) return lapsed(co) ? "free" : co.plan;
  return shop?.plan === "pro" ? "pro" : "free";
}

// The rules, written against an explicit config so the server can use them too.
export function evalPro(config, shop) {
  if (!config.gating.enforce) return true;
  return planOf(shop) === "pro";
}

// Is this feature available? Order: global switch off, the shop's override, the company's
// override, then (when enforcing) the plan.
export function evalFeature(config, shop, key) {
  if (config.flags[key] === false) return false;
  const own = shop?.controls?.feature_overrides?.[key];
  if (typeof own === "boolean") return own;
  const co = shop?.orgControls?.feature_overrides?.[key];
  if (typeof co === "boolean") return co;
  if (!config.gating.enforce) return !["api_access", "mcp_access"].includes(key);
  return (config.plans[planOf(shop)]?.features || []).includes(key);
}

// A numeric limit (staff, AI scans per month), or null when none applies: limits only bite when
// plans are enforced or an admin set one on the shop or the company.
export function evalLimit(config, shop, key) {
  const own = shop?.controls?.limits?.[key];
  if (typeof own === "number") return own;
  const co = shop?.orgControls?.limits?.[key];
  if (typeof co === "number") return co;
  if (!config.gating.enforce) return null;
  return config.plans[planOf(shop)]?.limits?.[key] ?? null;
}

// Where a limit comes from, for counting: "shop" when the shop's own override sets it (that shop is
// counted alone), "company" otherwise (all the company's shops are counted together).
export function limitScope(shop, key) {
  return typeof shop?.controls?.limits?.[key] === "number" ? "shop" : "company";
}

export const isPro = (shop) => evalPro(CONFIG, shop);
export const hasFeature = (shop, key) => evalFeature(CONFIG, shop, key);
export const limitOf = (shop, key) => evalLimit(CONFIG, shop, key);

// Price shown to a customer, with GST made explicit.
export function priceWithTax(amount, tax = CONFIG.tax) {
  const rate = Number(tax.gstRatePct) || 0;
  if (tax.pricesIncludeGst) {
    const base = Math.round((amount * 100) / (100 + rate));
    return { base, gst: amount - base, total: amount, rate, inclusive: true };
  }
  const gst = Math.round((amount * rate) / 100);
  return { base: amount, gst, total: amount + gst, rate, inclusive: false };
}
