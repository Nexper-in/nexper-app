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

// The plan a shop is on right now: the admin's override first (and it lapses
// when its end date passes), otherwise the shop's own plan field.
export function planOf(shop) {
  const c = shop?.controls;
  if (c?.plan) {
    if (c.plan_expires_at && new Date(c.plan_expires_at) < new Date()) return "free";
    return c.plan;
  }
  return shop?.plan === "pro" ? "pro" : "free";
}

// The rules, written against an explicit config so the server can use them too.
export function evalPro(config, shop) {
  if (!config.gating.enforce) return true;
  return planOf(shop) === "pro";
}

// Is this feature available to this shop? Order: global switch off, then the
// admin's per-shop override, then (when enforcing) the shop's plan.
export function evalFeature(config, shop, key) {
  if (config.flags[key] === false) return false;
  const override = shop?.controls?.feature_overrides?.[key];
  if (typeof override === "boolean") return override;
  if (!config.gating.enforce) return !["api_access", "mcp_access"].includes(key);
  return (config.plans[planOf(shop)]?.features || []).includes(key);
}

// A numeric limit for this shop (staff, AI scans per month), or null when no
// limit applies: limits only bite when plans are enforced or the admin set one
// on this shop.
export function evalLimit(config, shop, key) {
  const own = shop?.controls?.limits?.[key];
  if (typeof own === "number") return own;
  if (!config.gating.enforce) return null;
  return config.plans[planOf(shop)]?.limits?.[key] ?? null;
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
