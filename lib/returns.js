// Sales returns: what can still be sent back from a bill, and what the
// refund will be. The database function process_return() repeats these
// checks; this file only drives the screen, so the numbers match what the
// owner sees before they tap Return.

const money = (n) => Math.round(Number(n || 0) * 100) / 100;

// How much of each item on the bill is still returnable.
// returnsForBill: sale_returns rows for this bill (may be empty).
export function returnableLines(bill, returnsForBill = []) {
  const back = new Map();
  for (const r of returnsForBill) {
    for (const it of r.items || []) {
      back.set(it.shop_product_id, (back.get(it.shop_product_id) || 0) + Number(it.qty || 0));
    }
  }
  const sold = new Map();
  for (const it of bill.items || []) {
    if (!it.shop_product_id) continue;
    const cur = sold.get(it.shop_product_id) || { shop_product_id: it.shop_product_id, name: it.name, unit: it.unit || "", price: Number(it.price || 0), qty: 0 };
    cur.qty += Number(it.qty || 0);
    sold.set(it.shop_product_id, cur);
  }
  return [...sold.values()]
    .map((l) => ({ ...l, returned: back.get(l.shop_product_id) || 0, left: Math.max(0, Math.round((l.qty - (back.get(l.shop_product_id) || 0)) * 1000) / 1000) }))
    .filter((l) => l.left > 0);
}

// Refund for the picked quantities: price on the bill, scaled by the bill's own
// discount (total / subtotal), so a discounted bill never over-refunds.
export function refundFor(bill, lines, picked) {
  const ratio = Number(bill.subtotal) > 0 ? Number(bill.total) / Number(bill.subtotal) : 1;
  return money(lines.reduce((s, l) => s + Number(picked[l.shop_product_id] || 0) * l.price * ratio, 0));
}

// Refund methods the owner can choose for this bill.
export function refundMethods(bill) {
  if (bill.payment_type === "credit") return ["credit"]; // unpaid udhaar: reduce what they owe
  const own = bill.payment_method && bill.payment_method !== "cash" ? bill.payment_method : "cash";
  const out = [own];
  if (bill.customer_phone) out.push("credit");
  return out;
}
