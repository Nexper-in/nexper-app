// Rate limits for API routes. The count lives in the database (rate_hit, migration 041), so it
// holds across every server instance and survives cold starts. If the database call fails (or
// before update 041) it falls back to a per-instance in-memory count: a speed bump, not a guarantee.
import { createAdminClient } from "@/lib/supabaseAdmin";

const buckets = new Map();

function localLimited(key, windowMs, max) {
  const now = Date.now();
  const timestamps = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  buckets.set(key, timestamps);
  return timestamps.length > max;
}

// Resolves true when this call is over the limit. ALWAYS await it.
export async function isRateLimited(key, { windowMs = 60_000, max = 10 } = {}) {
  try {
    const { data, error } = await createAdminClient().rpc("rate_hit", { p_key: key, p_window_seconds: Math.max(1, Math.round(windowMs / 1000)), p_max: max });
    if (!error && typeof data === "boolean") return data;
  } catch {
    /* fall through to the local count */
  }
  return localLimited(key, windowMs, max);
}

export function requestIp(request) {
  // On Vercel these are set by the platform and can't be forged by the caller,
  // unlike the first entry of a plain x-forwarded-for.
  const platform = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-real-ip");
  if (platform) return platform.split(",")[0].trim();
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",").pop().trim() : "unknown";
}
