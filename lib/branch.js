import { fetchAll } from "@/lib/fetchAll";

// A new branch of a chain starts with the same items as an existing shop: the
// products themselves are shared across the company (one catalog), so this only
// creates the branch's own price-and-stock rows, with nothing in stock yet.
export async function copyCatalog(supabase, fromShopId, toShopId) {
  const { data, error } = await fetchAll(() =>
    supabase.from("shop_products").select("product_id, code, price, cost_price, mrp, gst, low_at, quick").eq("shop_id", fromShopId).order("id")
  );
  if (error) throw error;
  const rows = (data || []).map((r) => ({ ...r, shop_id: toShopId, stock: 0 }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insertError } = await supabase.from("shop_products").insert(rows.slice(i, i + 500));
    if (insertError) throw insertError;
  }
  return rows.length;
}

// How a person's company role reads on the Company screen.
export const ORG_ROLES = [
  { id: "owner", label: "Owner", hint: "Everything, in every shop." },
  { id: "manager", label: "Manager", hint: "Runs every shop: billing, stock, udhaar, reports. Cannot change settings, the team or delete a shop." },
  { id: "area_manager", label: "Area manager", hint: "A manager for the shops you choose only." },
  { id: "analyst", label: "Analyst", hint: "Reads sales, bills and reports in every shop. Cannot change anything." },
];
