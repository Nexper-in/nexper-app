// SERVER-ONLY. The shop as the plan rules see it: the shop row plus its own admin controls
// and its company's controls (lib/platformConfig.js uses all three). Pass a service-role client.
export async function loadTenantView(admin, shopId) {
  if (!shopId) return null;
  const { data: shop } = await admin.from("shops").select("id, plan, org_id").eq("id", shopId).maybeSingle();
  if (!shop) return null;
  const [{ data: controls }, orgRes] = await Promise.all([
    admin.from("tenant_controls").select("*").eq("shop_id", shopId).maybeSingle(),
    shop.org_id ? admin.from("org_controls").select("*").eq("org_id", shop.org_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // Before database update 039 there is no org_controls table: the company layer is simply empty.
  return { ...shop, controls: controls || null, orgControls: orgRes.error ? null : orgRes.data || null };
}
