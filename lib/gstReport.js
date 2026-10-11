// GST reporting helpers for the Reports page.
//
// Tier 1 = a rate-wise summary for the selected month (taxable value, CGST,
// SGST) — enough to fill GSTR-3B by hand or hand to an accountant.
//
// Tier 2 = a best-effort GSTR-1 JSON covering the b2cs (B2C small, rate-wise)
// and hsn (HSN-wise) sections, in the shape the GST Offline Utility accepts.
// Every sale is treated as B2C and intra-state, since Nexper doesn't
// capture a buyer GSTIN or a differing place of supply — true for counter
// retail, not for shops that also invoice registered businesses.
//
// bill.items (jsonb) stores GST-INCLUSIVE line prices, so the tax portion
// of a line is extracted with qty*price*gst/(100+gst) — same formula used
// on the billing screen itself (see billing/page.js).

const UQC = {
  pcs: "PCS-PIECES",
  kg: "KGS-KILOGRAMS",
  g: "GMS-GRAMS",
  l: "LTR-LITRE",
  ml: "MLT-MILILITRE",
  packet: "OTH-OTHERS",
};

// Returns taken back in the period, shaped like bills with negative
// quantities, so they net off the sales they came from. Return lines already
// carry the discounted price and the GST rate.
export function returnsAsBills(returns = []) {
  return (returns || []).map((r) => ({
    items: (r.items || []).map((it) => ({ ...it, qty: -Number(it.qty || 0) })),
  }));
}

function lineTax(line) {
  const total = line.qty * line.price;
  const rate = line.gst || 0;
  const tax = rate ? (total * rate) / (100 + rate) : 0;
  return { total, rate, tax, taxable: total - tax };
}

export function computeGstSummary(bills) {
  const byRate = new Map();
  for (const bill of bills) {
    for (const line of bill.items || []) {
      const { total, rate, tax, taxable } = lineTax(line);
      const bucket = byRate.get(rate) || { rate, taxable: 0, tax: 0, total: 0 };
      bucket.taxable += taxable;
      bucket.tax += tax;
      bucket.total += total;
      byRate.set(rate, bucket);
    }
  }
  return [...byRate.values()]
    .sort((a, b) => a.rate - b.rate)
    .map((b) => ({ ...b, cgst: b.tax / 2, sgst: b.tax / 2 }));
}

export function summaryToCsv(summary) {
  const header = "GST Rate,Taxable Value,CGST,SGST,Total Tax,Total Sales (incl. tax)";
  const rows = summary.map((r) =>
    [`${r.rate}%`, r.taxable.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), r.tax.toFixed(2), r.total.toFixed(2)].join(",")
  );
  const totals = summary.reduce(
    (a, r) => ({
      taxable: a.taxable + r.taxable,
      cgst: a.cgst + r.cgst,
      sgst: a.sgst + r.sgst,
      tax: a.tax + r.tax,
      total: a.total + r.total,
    }),
    { taxable: 0, cgst: 0, sgst: 0, tax: 0, total: 0 }
  );
  rows.push(
    ["TOTAL", totals.taxable.toFixed(2), totals.cgst.toFixed(2), totals.sgst.toFixed(2), totals.tax.toFixed(2), totals.total.toFixed(2)].join(",")
  );
  return [header, ...rows].join("\n");
}

// itemsBySpId: Map of shop_product_id -> current inventory item (for hsn_code/unit/name)
export function buildGstr1Json({ shop, bills, itemsBySpId, period }) {
  const pos = shop.gstin ? shop.gstin.slice(0, 2) : "";
  const summary = computeGstSummary(bills);
  const b2cs = summary
    .filter((r) => r.rate > 0)
    .map((r) => ({
      sply_ty: "INTRA",
      rt: r.rate,
      typ: "OE",
      pos,
      txval: Number(r.taxable.toFixed(2)),
      iamt: 0,
      camt: Number(r.cgst.toFixed(2)),
      samt: Number(r.sgst.toFixed(2)),
      csamt: 0,
    }));

  const hsnMap = new Map();
  for (const bill of bills) {
    for (const line of bill.items || []) {
      const meta = itemsBySpId.get(line.shop_product_id) || {};
      const key = `${meta.hsn_code || ""}|${line.gst || 0}|${meta.unit || line.unit || "pcs"}`;
      const { total, rate, tax, taxable } = lineTax(line);
      const bucket = hsnMap.get(key) || {
        hsn_sc: meta.hsn_code || "",
        desc: meta.name || line.name || "",
        uqc: UQC[meta.unit || line.unit] || "OTH-OTHERS",
        qty: 0,
        val: 0,
        txval: 0,
        camt: 0,
        samt: 0,
        rt: rate,
      };
      bucket.qty += line.qty;
      bucket.val += total;
      bucket.txval += taxable;
      bucket.camt += tax / 2;
      bucket.samt += tax / 2;
      hsnMap.set(key, bucket);
    }
  }
  const hsn = [...hsnMap.values()].map((h, i) => ({
    num: i + 1,
    hsn_sc: h.hsn_sc,
    desc: h.desc,
    uqc: h.uqc,
    qty: Number(h.qty.toFixed(3)),
    val: Number(h.val.toFixed(2)),
    txval: Number(h.txval.toFixed(2)),
    iamt: 0,
    camt: Number(h.camt.toFixed(2)),
    samt: Number(h.samt.toFixed(2)),
    csamt: 0,
    rt: h.rt,
  }));

  return { gstin: shop.gstin || "", fp: period, b2cs, hsn: { data: hsn } };
}

export function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
