// Monthly profit and loss from what the app already records.
//
//   Sales (what customers paid, incl. GST)
//   - Returns refunded
//   - GST collected (not your income)            => Net sales
//   - Cost of goods sold (qty x purchase price)  => Gross profit
//   - Running costs (logged expenses)
//   - Fixed monthly costs                        => Profit
//
// Two things are deliberately NOT counted as running costs:
//   - "Supplier payment" expenses: paying a supplier settles stock that is
//     already counted in cost of goods sold, so counting it again would double it.
//   - Logged expenses in the same category as a fixed monthly cost (for example
//     "Rent"): they are treated as paying that fixed cost, not a second cost.

const money = (n) => Math.round(Number(n || 0) * 100) / 100;

export const EXCLUDED_EXPENSE = "Supplier payment";

function lineGst(line) {
  const total = Number(line.qty || 0) * Number(line.price || 0);
  const rate = Number(line.gst || 0);
  return rate ? (total * rate) / (100 + rate) : 0;
}

export function monthlyPnL({ bills = [], returns = [], items = [], expenses = [], fixed = [] }) {
  const cost = new Map(items.map((i) => [i.id, i.cost_price == null ? null : Number(i.cost_price)]));
  let sales = 0, gst = 0, cogs = 0, noCostRevenue = 0, noCostLines = 0;

  for (const b of bills) {
    sales += Number(b.total || 0);
    const sub = Number(b.subtotal || 0);
    const ratio = sub > 0 ? Number(b.total || 0) / sub : 1;
    for (const l of b.items || []) {
      gst += lineGst(l) * ratio;
      const c = cost.get(l.shop_product_id);
      if (c == null || !(c > 0)) {
        noCostLines += 1;
        noCostRevenue += Number(l.qty || 0) * Number(l.price || 0) * ratio;
      } else cogs += Number(l.qty || 0) * c;
    }
  }

  let refunds = 0;
  for (const r of returns) {
    refunds += Number(r.refund_amount || 0);
    for (const l of r.items || []) {
      gst -= lineGst(l);
      const c = cost.get(l.shop_product_id);
      if (c != null && c > 0) cogs -= Number(l.qty || 0) * c; // goods came back on the shelf
    }
  }

  const fixedCats = new Set(fixed.map((f) => f.category));
  const byCategory = new Map();
  let running = 0, skippedSupplier = 0, skippedFixedDup = 0;
  for (const e of expenses) {
    const a = Number(e.amount || 0);
    if (e.category === EXCLUDED_EXPENSE) { skippedSupplier += a; continue; }
    if (fixedCats.has(e.category)) { skippedFixedDup += a; continue; }
    running += a;
    byCategory.set(e.category || "Other", (byCategory.get(e.category || "Other") || 0) + a);
  }
  const fixedTotal = fixed.reduce((s, f) => s + Number(f.amount || 0), 0);

  const netSales = sales - refunds - gst;
  const grossProfit = netSales - cogs;
  const profit = grossProfit - running - fixedTotal;
  return {
    sales: money(sales), refunds: money(refunds), gst: money(gst), netSales: money(netSales),
    cogs: money(cogs), grossProfit: money(grossProfit),
    running: money(running), runningByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount: money(amount) })).sort((a, b) => b.amount - a.amount),
    fixed: money(fixedTotal), fixedList: fixed.map((f) => ({ name: f.name, amount: money(f.amount) })),
    profit: money(profit),
    marginPct: netSales > 0 ? Math.round((profit / netSales) * 1000) / 10 : null,
    notes: { noCostLines, noCostRevenue: money(noCostRevenue), skippedSupplier: money(skippedSupplier), skippedFixedDup: money(skippedFixedDup) },
  };
}
