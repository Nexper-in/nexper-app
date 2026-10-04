import { NextResponse } from "next/server";
import { authenticateKey, hasScope, getShop, listItems, lowStock, listBills, todaySummary, outstandingUdhaar, expiringItems } from "@/lib/shopApi";
import { serverError } from "@/lib/apiSafe";

// Read-only REST API for a shop, signed with an API key from the admin console:
//   curl -H "Authorization: Bearer nxp_..." https://app.nexper.in/api/v1/summary/today
//
//   GET /api/v1/shop                       read:shop
//   GET /api/v1/items?q=&limit=            read:stock
//   GET /api/v1/low-stock?limit=           read:stock
//   GET /api/v1/expiring?days=             read:stock
//   GET /api/v1/bills?from=&to=&limit=     read:bills
//   GET /api/v1/summary/today              read:bills
//   GET /api/v1/udhaar?limit=              read:udhaar
const ROUTES = {
  shop: ["read:shop", (c) => getShop(c)],
  items: ["read:stock", (c, q) => listItems(c, { q: q.get("q"), limit: q.get("limit") })],
  "low-stock": ["read:stock", (c, q) => lowStock(c, { limit: q.get("limit") })],
  expiring: ["read:stock", (c, q) => expiringItems(c, { days: q.get("days") })],
  bills: ["read:bills", (c, q) => listBills(c, { from: q.get("from"), to: q.get("to"), limit: q.get("limit") })],
  "summary/today": ["read:bills", (c) => todaySummary(c)],
  udhaar: ["read:udhaar", (c, q) => outstandingUdhaar(c, { limit: q.get("limit") })],
};

export async function GET(request, { params }) {
  const { path = [] } = await params;
  const route = ROUTES[path.join("/")];
  if (!route) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const auth = await authenticateKey(request, { feature: "api" });
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const [scope, run] = route;
  if (!hasScope(auth.ctx, scope)) return NextResponse.json({ error: `This key needs the ${scope} scope` }, { status: 403 });

  try {
    const data = await run(auth.ctx, new URL(request.url).searchParams);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return serverError(err, "api/v1");
  }
}
