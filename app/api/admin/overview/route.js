import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabaseAdmin";
import { fetchAll } from "@/lib/fetchAll";
import { serverError } from "@/lib/apiSafe";

export async function GET(request) {
  const { admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  // Shops and members are read page by page (the API stops at 1000 rows), and
  // the bill and udhaar totals are summed by the database (migration 031)
  // instead of downloading every bill and credit entry of every shop.
  const [shopsRes, membersRes, statsRes, udhaarRes] = await Promise.all([
    fetchAll(() => admin.from("shops").select("id, owner_id, name, type, created_at, enabled_modules").order("created_at").order("id")),
    fetchAll(() => admin.from("shop_members").select("id, shop_id, user_id, role, name, staff_code, permissions").order("role", { ascending: false }).order("id")),
    admin.rpc("admin_shop_stats"),
    admin.rpc("admin_udhaar_outstanding"),
  ]);
  if (shopsRes.error) return serverError(shopsRes.error, "admin/overview shops");
  if (membersRes.error) return serverError(membersRes.error, "admin/overview members");
  // Before migration 031 the two totals functions do not exist: say so plainly.
  if (statsRes.error || udhaarRes.error) {
    return NextResponse.json({ error: "Run database update 031 (see MAQBOOL_TASKS), then reload." }, { status: 500 });
  }
  const shops = shopsRes.data;
  const members = membersRes.data;

  // Per-shop bill stats and the platform totals
  const billCountByShop = {};
  const lastBillByShop = {};
  let platformGmv = 0;
  for (const row of statsRes.data || []) {
    billCountByShop[row.shop_id] = Number(row.bill_count);
    platformGmv += Number(row.bill_total || 0);
    lastBillByShop[row.shop_id] = row.last_bill_at;
  }
  const udhaaarOutstanding = Number(udhaarRes.data || 0);

  const membersByShop = {};
  for (const m of members) (membersByShop[m.shop_id] ||= []).push(m);

  const usersById = {};
  for (let page = 1; page <= 100; page++) {
    const { data: userList, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersError) return serverError(usersError, "admin/overview users");
    for (const u of userList.users) usersById[u.id] = u;
    if (userList.users.length < 1000) break;
  }

  const ownersById = {};
  let staffCount = 0;
  for (const shop of shops) {
    if (!ownersById[shop.owner_id]) {
      const u = usersById[shop.owner_id];
      ownersById[shop.owner_id] = {
        id: shop.owner_id,
        email: u?.email || "(unknown)",
        created_at: u?.created_at || null,
        banned: !!(u?.banned_until && new Date(u.banned_until) > new Date()),
        shops: [],
      };
    }
    const shopMembers = (membersByShop[shop.id] || []).map((m) => ({
      id: m.id,
      user_id: m.user_id,
      email: usersById[m.user_id]?.email || "(unknown)",
      role: m.role,
      name: m.name,
      staff_code: m.staff_code,
      permissions: m.permissions,
    }));
    const shopStaffCount = shopMembers.filter((m) => m.role === "staff").length;
    staffCount += shopStaffCount;

    ownersById[shop.owner_id].shops.push({
      id: shop.id,
      name: shop.name,
      type: shop.type,
      created_at: shop.created_at,
      bill_count: billCountByShop[shop.id] || 0,
      last_bill_at: lastBillByShop[shop.id] || null,
      staff_count: shopStaffCount,
      members: shopMembers,
    });
  }

  const owners = Object.values(ownersById).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return NextResponse.json({
    owners,
    totals: {
      ownerCount: owners.length,
      shopCount: shops.length,
      billCount: Object.values(billCountByShop).reduce((a, b) => a + b, 0),
      staffCount,
      platformGmv: Math.round(platformGmv * 100) / 100,
      udhaaarOutstanding: Math.round(udhaaarOutstanding * 100) / 100,
    },
  });
}
