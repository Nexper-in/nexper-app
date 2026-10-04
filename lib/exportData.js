import { fetchAll } from "@/lib/fetchAll";

// "Download my data": everything a shop owner has put into Nexper, as a zip of
// spreadsheet files (CSV) that opens in Excel or Google Sheets. It reads with
// the owner's own session, so the same access rules apply as everywhere else:
// it can only ever contain this shop's data.

// A cell that starts with = + - @ is run as a formula by Excel, which is how
// a customer name like "=HYPERLINK(...)" could attack whoever opens the file.
// Text cells starting with those characters get a leading apostrophe; real
// numbers are left alone.
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  let s = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Rows -> CSV text. `columns` fixes the order; the byte order mark makes Excel
// read the Hindi/Telugu/Tamil names correctly.
export function toCsv(rows, columns) {
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// One line per item sold, which is what an accountant wants.
export function billLines(bills) {
  const out = [];
  for (const b of bills) {
    for (const l of b.items || []) {
      out.push({
        bill_no: b.bill_no,
        date: b.date,
        customer_name: b.customer_name,
        customer_phone: b.customer_phone,
        payment_type: b.payment_type,
        payment_method: b.payment_method,
        item: l.name,
        qty: l.qty,
        unit: l.unit,
        price: l.price,
        gst_percent: l.gst,
        line_total: Math.round(Number(l.qty || 0) * Number(l.price || 0) * 100) / 100,
      });
    }
  }
  return out;
}

const drop = (row, ...keys) => {
  const copy = { ...row };
  for (const k of keys) delete copy[k];
  return copy;
};

// What is read, and how it is named in the zip. `select` may join another table.
export const EXPORTS = [
  { file: "bills", table: "bills" },
  { file: "udhaar_entries", table: "credits" },
  { file: "stock_movements", table: "movements" },
  { file: "stock_batches", table: "stock_batches" },
  { file: "expenses", table: "expenses" },
  { file: "fixed_expenses", table: "fixed_expenses" },
  { file: "owner_draws", table: "draws" },
  { file: "day_close", table: "reconciliations" },
  { file: "offer_posts", table: "offer_posts" },
  { file: "clearance_offers", table: "clearance_offers" },
  { file: "clearance_offer_items", table: "clearance_offer_items", select: "*, clearance_offers!inner(shop_id)", scope: "clearance_offers.shop_id", clean: (r) => drop(r, "clearance_offers") },
  { file: "purchase_orders", table: "purchase_orders" },
  { file: "purchase_order_items", table: "purchase_order_items", select: "*, purchase_orders!inner(shop_id)", scope: "purchase_orders.shop_id", clean: (r) => drop(r, "purchase_orders") },
  { file: "supply_departments", table: "supply_points" },
  { file: "supply_entries", table: "supply_entries" },
  { file: "supply_payments", table: "supply_payments" },
  {
    file: "items",
    table: "shop_products",
    select: "*, product:products(name, hindi_name, barcode, category, unit, hsn_code)",
    clean: (r) => ({ ...drop(r, "product"), name: r.product?.name, hindi_name: r.product?.hindi_name, barcode: r.product?.barcode, category: r.product?.category, unit: r.product?.unit, hsn_code: r.product?.hsn_code }),
  },
  {
    file: "suppliers",
    table: "shop_suppliers",
    select: "owed, supplier_id, supplier:suppliers(name, phone, items)",
    order: "supplier_id",
    clean: (r) => ({ name: r.supplier?.name, phone: r.supplier?.phone, supplies: r.supplier?.items, we_owe: r.owed }),
  },
  { file: "team", table: "shop_members", select: "name, role, created_at", order: "created_at", clean: (r) => r },
];

const README = (shop, counts, skipped, when) => `Nexper: your data
Shop: ${shop.name}
Downloaded: ${when}

These are spreadsheet files (CSV). Open them in Excel or Google Sheets.
Each file is one list from your shop; bill_lines.csv has one row per item sold.

${counts.map(([f, n]) => `  ${f}.csv  (${n} rows)`).join("\n")}
${skipped.length ? `\nNot available yet in this account (skipped): ${skipped.join(", ")}\n` : ""}
Passwords, PINs and sign-in details are never included.
`;

// Reads everything and returns { "name.csv": text, ... } plus a row count per file.
export async function buildExport(supabase, shop, { onProgress } = {}) {
  const files = {};
  const counts = [];
  const skipped = [];
  const when = new Date().toISOString().slice(0, 10);
  let done = 0;
  for (const spec of EXPORTS) {
    const scope = spec.scope || "shop_id";
    const { data, error } = await fetchAll(() => {
      let q = supabase.from(spec.table).select(spec.select || "*");
      return q.eq(scope, shop.id).order(spec.order || "id");
    });
    done++;
    onProgress?.(done, EXPORTS.length + 1);
    if (error) {
      // A table from a database update that has not been run yet: leave it out.
      if (/does not exist|schema cache|relation/i.test(error.message || "")) {
        skipped.push(spec.file);
        continue;
      }
      throw new Error(`${spec.file}: ${error.message}`);
    }
    const rows = spec.clean ? data.map(spec.clean) : data;
    files[`${spec.file}.csv`] = toCsv(rows);
    counts.push([spec.file, rows.length]);
    if (spec.table === "bills") {
      const lines = billLines(data);
      files["bill_lines.csv"] = toCsv(lines);
      counts.push(["bill_lines", lines.length]);
    }
  }
  files["shop.json"] = JSON.stringify(
    { name: shop.name, type: shop.type, gstin: shop.gstin, upi_id: shop.upi_id, whatsapp_group_url: shop.whatsapp_group_url, created_at: shop.created_at },
    null,
    2
  );
  files["README.txt"] = README(shop, counts, skipped, when);
  onProgress?.(EXPORTS.length + 1, EXPORTS.length + 1);
  return { files, counts, skipped };
}

export function exportFileName(shop, now = new Date()) {
  const slug = String(shop.name || "shop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "shop";
  return `nexper-${slug}-${now.toISOString().slice(0, 10)}.zip`;
}
