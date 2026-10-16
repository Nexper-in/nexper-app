import { NextResponse } from "next/server";
import { fetchAll } from "@/lib/fetchAll";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";
import { readJson, serverError } from "@/lib/apiSafe";
import { normalizeOrgControls } from "@/lib/platformDefaults";

// Companies (a shop owner and their branches) with their plan, limits, billing details and
// this month's pooled AI scans. The company is the tenant for billing (migration 039).
export async function GET(request) {
  const { admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [orgs, controls, shops, usage] = await Promise.all([
    fetchAll(() => admin.from("organisations").select("id, name, owner_id, max_shops, created_at").order("created_at", { ascending: false }).order("id")),
    fetchAll(() => admin.from("org_controls").select("*").order("org_id")),
    fetchAll(() => admin.from("shops").select("id, name, org_id, status").order("created_at").order("id")),
    fetchAll(() => admin.from("ai_usage").select("id, org_id").gte("created_at", monthStart.toISOString()).order("id")),
  ]);
  if (orgs.error) {
    if (/does not exist|schema cache/i.test(orgs.error.message)) return NextResponse.json({ needsMigration: true, companies: [] });
    return serverError(orgs.error, "admin/org-controls");
  }
  const ctl = Object.fromEntries((controls.data || []).map((c) => [c.org_id, c]));
  const scans = {};
  for (const u of usage.data || []) if (u.org_id) scans[u.org_id] = (scans[u.org_id] || 0) + 1;
  const byOrg = {};
  for (const s of shops.data || []) (byOrg[s.org_id] ||= []).push({ id: s.id, name: s.name, status: s.status || "active" });

  return NextResponse.json({
    needsMigration: Boolean(controls.error),
    companies: orgs.data.map((o) => ({ ...o, controls: ctl[o.id] || null, shops: byOrg[o.id] || [], ai_scans_this_month: scans[o.id] || 0 })),
  });
}

export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  const { orgId, controls, maxShops } = await readJson(request);
  if (!orgId || typeof orgId !== "string") return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  let clean;
  try {
    clean = normalizeOrgControls(controls || {});
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  const { data: org } = await admin.from("organisations").select("id, name").eq("id", orgId).maybeSingle();
  if (!org) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  if (maxShops !== undefined && maxShops !== null && maxShops !== "") {
    const n = Number(maxShops);
    if (!Number.isInteger(n) || n < 1 || n > 500) return NextResponse.json({ error: "Shop limit must be a whole number from 1 to 500" }, { status: 400 });
    const { count } = await admin.from("shops").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active");
    if (n < (count || 0)) return NextResponse.json({ error: `This company has ${count} open shops. The limit cannot be lower.` }, { status: 400 });
    const { error: oe } = await admin.from("organisations").update({ max_shops: n }).eq("id", orgId);
    if (oe) return serverError(oe, "admin/org-controls");
    await logAdminAction(admin, caller.id, caller.email, "set_max_shops", "organisation", orgId, { company: org.name, maxShops: n });
  }

  const { error: e } = await admin.from("org_controls").upsert({ org_id: orgId, ...clean, updated_at: new Date().toISOString(), updated_by: caller.id });
  if (e) {
    if (/does not exist|schema cache/i.test(e.message)) return NextResponse.json({ error: "Run database update 039 first (see MAQBOOL_TASKS)." }, { status: 400 });
    return serverError(e, "admin/org-controls");
  }
  await logAdminAction(admin, caller.id, caller.email, "update_org_controls", "organisation", orgId, { company: org.name, plan: clean.plan, expires: clean.plan_expires_at, limits: clean.limits, overrides: Object.keys(clean.feature_overrides) });
  return NextResponse.json({ ok: true });
}
