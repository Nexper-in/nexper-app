// Which company is "the current one", and what is the person's role in it? A person can belong to
// several companies (own one, manage another), so this follows the shop that is open now.
//   orgData: { orgs: [...organisations], roles: { [orgId]: { role, shopIds } } } | null | undefined
// Returns undefined while loading, null when there is no company (before update 035), otherwise
// { org, role, shopIds }.
export function pickOrgInfo(orgData, shops, closedShops, activeShopId) {
  if (orgData === undefined || orgData === null) return orgData;
  const shop = (shops || []).find((x) => x.id === activeShopId) || (closedShops || []).find((x) => x.id === activeShopId);
  const org = orgData.orgs.find((o) => o.id === shop?.org_id) || (shop ? null : orgData.orgs[0]);
  if (!org) return null;
  const mine = orgData.roles?.[org.id];
  return { org, role: mine?.role || null, shopIds: mine?.shopIds || [] };
}
