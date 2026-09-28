import { rupee } from "@/lib/format";

// Manual wa.me deep links — pre-fills a WhatsApp message for the owner to
// hit send. Phase 2 (per PROJECT_BRIEF.md) replaces this with the WhatsApp
// Cloud API for automatic sending; this is the correct phase-1 behavior.
export function whatsappLink(phone, text) {
  const digits = (phone || "").replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(text)}`;
}

export function upiUri(upiId, payeeName, amount, note) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: amount ? String(Math.round(amount * 100) / 100) : "",
    cu: "INR",
    tn: note || "",
  });
  return `upi://pay?${params.toString()}`;
}

export function upiQrImageUrl(uri, size = 180) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(uri)}`;
}

// Tax breakup assuming line prices are GST-inclusive (standard for retail).
export function taxBreakup(billItems) {
  let taxable = 0,
    taxAmt = 0;
  (billItems || []).forEach((it) => {
    const lineTotal = it.qty * it.price;
    if (it.gst) {
      const base = (lineTotal * 100) / (100 + it.gst);
      taxable += base;
      taxAmt += lineTotal - base;
    } else {
      taxable += lineTotal;
    }
  });
  return { taxable: Math.round(taxable * 100) / 100, taxAmt: Math.round(taxAmt * 100) / 100 };
}

export function billMessageText(bill, storeName, gstin) {
  const lines = (bill.items || []).map((it) => `• ${it.name} x ${it.qty}${it.unit} — ${rupee(it.qty * it.price)}`).join("\n");
  const { taxable, taxAmt } = taxBreakup(bill.items);
  const taxLine = taxAmt > 0 ? `\nTaxable: ${rupee(taxable)}\nGST: ${rupee(taxAmt)}\n` : "";
  const gstinLine = gstin ? `GSTIN: ${gstin}\n` : "";
  const mrpSavings = (bill.items || []).reduce((s, it) => (it.mrp > it.price ? s + (it.mrp - it.price) * it.qty : s), 0);
  const savingsLine = mrpSavings > 0 ? `\n🏷️ You saved ${rupee(mrpSavings)} vs MRP\n` : "";
  return `*${storeName}*\n${gstinLine}Bill No: ${bill.bill_no}\nDate: ${new Date(bill.date).toLocaleString("en-IN")}\n\n${lines}\n${taxLine}${savingsLine}\n*Total: ${rupee(bill.total)}*\n\nThank you for shopping with us!`;
}

export function creditReminderText(storeName, name, balance) {
  return `*${storeName}*\nHi ${name || "there"}, this is a friendly reminder that your outstanding balance (udhaar) is *${rupee(balance)}*. Please settle at your convenience. Thank you!`;
}

export function dailyReportText(storeName, todaysBills, items) {
  const totalSales = todaysBills.reduce((s, b) => s + b.total, 0);
  const totalProfit = todaysBills.reduce((sum, b) => {
    return sum + (b.items || []).reduce((s, line) => {
      const item = items.find((i) => i.id === line.shop_product_id);
      const cost = item?.cost_price ?? 0;
      return s + (line.price - cost) * line.qty;
    }, 0);
  }, 0);
  const cash = todaysBills.filter((b) => b.payment_method === "cash").reduce((s, b) => s + b.total, 0);
  const upi = todaysBills.filter((b) => b.payment_method === "upi").reduce((s, b) => s + b.total, 0);
  const card = todaysBills.filter((b) => b.payment_method === "card").reduce((s, b) => s + b.total, 0);

  // Top 3 items by revenue
  const itemMap = new Map();
  todaysBills.forEach((b) => (b.items || []).forEach((line) => {
    const cur = itemMap.get(line.name) || 0;
    itemMap.set(line.name, cur + line.price * line.qty);
  }));
  const topItems = [...itemMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
  const paymentLines = [
    cash > 0 ? `  💵 Cash: ${rupee(cash)}` : "",
    upi > 0 ? `  📱 UPI: ${rupee(upi)}` : "",
    card > 0 ? `  💳 Card: ${rupee(card)}` : "",
  ].filter(Boolean).join("\n");

  const topLine = topItems.length
    ? `\n🏆 *Top items*\n${topItems.map(([n, v], i) => `  ${i + 1}. ${n} — ${rupee(v)}`).join("\n")}`
    : "";

  return `📊 *Daily Report — ${storeName}*\n${date}\n\n💰 *Total Sales: ${rupee(totalSales)}*\n📦 ${todaysBills.length} bill${todaysBills.length === 1 ? "" : "s"}\n\n*Payment split*\n${paymentLines || "  —"}\n\n💹 *Profit: ~${rupee(totalProfit)}*${topLine}\n\n_Sent from Nexper_`;
}
