import { NextResponse } from "next/server";
import { getRequestUser, createAdminClient } from "@/lib/supabaseAdmin";
import { mergeSettings } from "@/lib/platformDefaults";
import { evalFeature, evalLimit, limitScope } from "@/lib/platformConfig";
import { loadTenantView } from "@/lib/tenantView";
import { isRateLimited } from "@/lib/rateLimit";

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// base64 is ~4/3 of the file, so this is roughly a 6 MB photo.
const MAX_IMAGE_CHARS = 8_000_000;

// Checks run before any call that spends the Anthropic budget: the caller must
// be signed in, under the per-user speed limit, and send a sensible image.
// Returns { error: NextResponse } to send back, or { user, image, mediaType }.
export async function guardImageRequest(request, { feature = "ocr_scan" } = {}) {
  const user = await getRequestUser(request);
  if (!user) return { error: NextResponse.json({ error: "Please sign in to scan." }, { status: 401 }) };

  if (await isRateLimited(`ai:${user.id}`, { windowMs: 60_000, max: 8 })) {
    return { error: NextResponse.json({ error: "Too many scans. Wait a minute and try again." }, { status: 429 }) };
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return { error: NextResponse.json({ error: "Invalid request body" }, { status: 400 }) };
  }
  const { image, mediaType } = body || {};
  if (!image || !mediaType) {
    return { error: NextResponse.json({ error: "image and mediaType are required" }, { status: 400 }) };
  }
  if (!MEDIA_TYPES.includes(mediaType)) {
    return { error: NextResponse.json({ error: "Use a JPG, PNG or WebP photo." }, { status: 400 }) };
  }
  if (typeof image !== "string" || image.length > MAX_IMAGE_CHARS) {
    return { error: NextResponse.json({ error: "That photo is too large. Try a smaller one." }, { status: 413 }) };
  }

  // Platform switches and the monthly scan allowance (admin console). The shop is the one the
  // scan was made from (checked against the caller's memberships); an older app that does not
  // send it is charged to the first shop the person belongs to, as before.
  const admin = createAdminClient();
  const { data: rows } = await admin.from("platform_settings").select("key, value");
  const config = mergeSettings(rows);
  const wanted = typeof body.shopId === "string" && /^[0-9a-f-]{36}$/i.test(body.shopId) ? body.shopId : null;
  let memberQuery = admin.from("shop_members").select("shop_id").eq("user_id", user.id);
  if (wanted) memberQuery = memberQuery.eq("shop_id", wanted);
  const { data: member } = await memberQuery.limit(1).maybeSingle();
  if (wanted && !member) return { error: NextResponse.json({ error: "That shop is not yours." }, { status: 403 }) };
  const shopId = member?.shop_id || null;
  const shopView = await loadTenantView(admin, shopId);
  if (!evalFeature(config, shopView, feature)) {
    return { error: NextResponse.json({ error: "Scanning isn't included in your plan right now." }, { status: 403 }) };
  }
  const limit = evalLimit(config, shopView, "aiScansPerMonth");
  if (shopId && limit !== null) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    // Pooled per company, unless the shop has its own limit (then that shop is counted alone).
    const pooled = limitScope(shopView, "aiScansPerMonth") === "company" && shopView?.org_id;
    let q = admin.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString());
    q = pooled ? q.eq("org_id", shopView.org_id) : q.eq("shop_id", shopId);
    let { count, error: countError } = await q;
    if (countError && pooled) {
      // Before database update 039 there is no org_id column: count the shop alone.
      ({ count } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("shop_id", shopId).gte("created_at", monthStart.toISOString()));
    }
    if ((count ?? 0) >= limit) {
      return { error: NextResponse.json({ error: "You've used this month's scans. They reset on the 1st." }, { status: 429 }) };
    }
  }
  if (shopId) await admin.from("ai_usage").insert({ shop_id: shopId, user_id: user.id, kind: feature });
  return { user, image, mediaType };
}

// Asks the vision model one question about one image and returns parsed JSON.
export async function readImageAsJson(Anthropic, { image, mediaType, prompt, maxTokens = 1500 }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let response;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
  } catch (err) {
    // The route only ever shows the shopkeeper a generic "busy" message, so
    // this is the one place that records *why* the Anthropic call actually
    // failed (bad/expired key vs a genuine overload) -- status/name/message
    // only, never the key or the full error object.
    console.error("[readImageAsJson] Anthropic call failed:", err?.status, err?.name, err?.message);
    throw err;
  }
  const raw = (response.content[0]?.text || "").trim();
  // Strip markdown code fences that the model sometimes wraps around JSON
  const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/```$/i, "").trim();
  return { raw, parsed: JSON.parse(cleaned) };
}
