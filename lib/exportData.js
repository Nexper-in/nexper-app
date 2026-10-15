// Full data export for the shop owner: one ZIP with a CSV per table and a
// short README. Built in the browser from rows the signed-in owner can already
// read (row-level security applies), so nothing is sent to a server.
import JSZip from "jszip";
import { toCsv } from "@/lib/csv";
import { SHOP_EXPORT, EXPORT_FORMAT } from "@/lib/shopTables";
import { fetchShopItems } from "@/lib/products";

const num = (n) => (n == null ? "" : Number(n));
const ist = (d) => (d ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) : "");
const itemsText = (items) => (items || []).map((i) => `${i.name} x ${i.qty}${i.unit || ""} @ ${i.price}`).join("; ");

// data: { shop, items, bills, credits, expenses, fixed, suppliers, returns, movements, reconciliations }
export function buildTables(d) {
  return {
    "items.csv": toCsv(
      ["Code", "Name", "Category", "Unit", "Selling price", "MRP", "Purchase price", "Stock", "Low stock at", "HSN", "GST %", "Barcode"],
      (d.items || []).map((i) => [i.code, i.name, i.category, i.unit, num(i.price), num(i.mrp), num(i.cost_price), num(i.stock), num(i.low_at), i.hsn_code, num(i.gst), i.barcode])
    ),
    "bills.csv": toCsv(
      ["Bill no", "Date", "Customer", "Phone", "Items", "Subtotal", "Discount", "Total", "Paid by", "Method"],
      (d.bills || []).map((b) => [b.bill_no, ist(b.date), b.customer_name, b.customer_phone, itemsText(b.items), num(b.subtotal), num(b.discount_amount), num(b.total), b.payment_type === "credit" ? "udhaar" : "paid", b.payment_type === "credit" ? "" : b.payment_method])
    ),
    "bill_lines.csv": toCsv(
      ["Bill no", "Date", "Item", "Qty", "Unit", "Price", "GST %", "Line total"],
      (d.bills || []).flatMap((b) => (b.items || []).map((l) => [b.bill_no, ist(b.date), l.name, num(l.qty), l.unit, num(l.price), num(l.gst), Math.round(Number(l.qty || 0) * Number(l.price || 0) * 100) / 100]))
    ),
    "udhaar.csv": toCsv(["Date", "Customer", "Phone", "Type", "Amount", "Note"], (d.credits || []).map((c) => [ist(c.date), c.name, c.phone, c.type === "charge" ? "credit given" : "payment received", num(c.amount), c.note])),
    "expenses.csv": toCsv(["Date", "Category", "Amount", "Note"], (d.expenses || []).map((e) => [ist(e.date), e.category, num(e.amount), e.note])),
    "fixed_costs.csv": toCsv(["Name", "Category", "Monthly amount", "Due day"], (d.fixed || []).map((f) => [f.name, f.category, num(f.amount), num(f.due_day)])),
    "suppliers.csv": toCsv(["Name", "Phone", "Supplies", "Owed"], (d.suppliers || []).map((s) => [s.name, s.phone, s.supplies, num(s.owed)])),
    "returns.csv": toCsv(["Date", "Bill no", "Customer", "Items", "Refund", "Refund by", "Reason"], (d.returns || []).map((r) => [ist(r.date), r.bill_no, r.customer_name, itemsText(r.items), num(r.refund_amount), r.refund_method, r.note])),
    "stock_movements.csv": toCsv(["Date", "Item", "In/Out", "Qty", "Reason", "Supplier"], (d.movements || []).map((m) => [ist(m.date), m.item_name, m.type, num(m.qty), m.reason, m.supplier])),
    "day_close.csv": toCsv(["Date", "Expected cash", "Counted", "Difference"], (d.reconciliations || []).map((r) => [ist(r.date), num(r.expected_cash), num(r.cash_counted), num(r.diff)])),
  };
}

// Every row of the shop's books exactly as stored (same list and format as
// tools/shop-export.mjs), read with the owner's own rights page by page. This is the file
// that can put a shop back after a mistake (docs/RUNBOOK_RESTORE.md) or move it.
export async function readRawShop(supabase, shopId) {
  const page = async (make) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await make().range(from, from + 999);
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) return out; // table not set up yet
        throw error;
      }
      out.push(...data);
      if (data.length < 1000) return out;
    }
  };
  const inChunks = async (table, column, ids) => {
    const out = [];
    for (let i = 0; i < ids.length; i += 100) out.push(...(await page(() => supabase.from(table).select("*").in(column, ids.slice(i, i + 100)).order("id"))));
    return out;
  };
  const tables = {};
  for (const spec of SHOP_EXPORT) {
    if (spec.by === "self") tables[spec.table] = await page(() => supabase.from(spec.table).select("*").eq("id", shopId));
    else if (spec.by === "shop") {
      let rows = await page(() => supabase.from(spec.table).select("*").eq("shop_id", shopId).order(spec.table === "shop_suppliers" ? "supplier_id" : "id"));
      if (spec.notNull) rows = rows.filter((r) => r[spec.notNull] == null);
      tables[spec.table] = rows;
    } else if (spec.by === "child") tables[spec.table] = await inChunks(spec.table, spec.fk, (tables[spec.parent] || []).map((r) => r.id));
    else {
      // The owner's shared items sit before the shop's own rows in the list (they must be loaded
      // first), so read the linking rows here to know which ones this shop uses.
      const links = await page(() => supabase.from(spec.via).select(spec.fk).eq("shop_id", shopId));
      tables[spec.table] = await inChunks(spec.table, "id", [...new Set(links.map((r) => r[spec.fk]))]);
    }
  }
  // The same two extras tools/shop-export.mjs adds, so tools/shop-import.mjs accepts this file:
  // the database update it was made at, and the company the shop belongs to.
  const orgId = tables.shops?.[0]?.org_id;
  let company = null;
  if (orgId) {
    const { data } = await supabase.from("organisations").select("*").eq("id", orgId).maybeSingle();
    company = data || null;
  }
  const { data: dbVersion } = await supabase.rpc("db_version");
  return { format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), dbVersion: typeof dbVersion === "string" ? dbVersion : null, shopId, company, tables };
}

export async function buildBackupZip(d) {
  const zip = new JSZip();
  const tables = buildTables(d);
  const stamp = new Date().toISOString().slice(0, 10);
  for (const [name, csv] of Object.entries(tables)) zip.file(name, "﻿" + csv); // BOM so Excel reads rupee signs and Indian scripts
  zip.file(
    "README.txt",
    `Nexper backup for ${d.shop?.name || "your shop"}\nExported ${stamp}\n\nOne file per list. Open them in Excel or Google Sheets.\nbills.csv has one row per bill; bill_lines.csv has one row per item sold.\ndata.json holds every record exactly as stored; Nexper support can use it to put the shop back after a mistake.\nKeep this file somewhere safe. It contains customer names and phone numbers.\n`
  );
  if (d.raw) zip.file("data.json", JSON.stringify(d.raw)); // everything exactly as stored: for restoring or moving the shop
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return { blob, filename: `nexper-backup-${(d.shop?.name || "shop").replace(/[^A-Za-z0-9]+/g, "-")}-${stamp}.zip`, counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, Math.max(0, v.split("\r\n").length - 1)])) };
}

// Reads everything the owner can read for one shop and builds the backup zip (spreadsheets plus
// data.json). Used by Store settings and by the closed-shop screen.
export async function createShopBackup(supabase, shop) {
  const readAll = async (table, select = "*") => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select(select).eq("shop_id", shop.id).range(from, from + 999);
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) return out; // table not set up yet
        throw error;
      }
      out.push(...data);
      if (data.length < 1000) return out;
    }
  };
  const [items, bills, credits, expenses, fixed, links, returns, movements, reconciliations] = await Promise.all([
    fetchShopItems(supabase, shop.id),
    readAll("bills"), readAll("credits"), readAll("expenses"), readAll("fixed_expenses"),
    readAll("shop_suppliers", "owed, supplier:suppliers(*)"),
    readAll("sale_returns"), readAll("movements"), readAll("reconciliations"),
  ]);
  const suppliers = links.map((l) => ({ ...(l.supplier || {}), owed: l.owed }));
  const raw = await readRawShop(supabase, shop.id);
  return buildBackupZip({ shop, items, bills, credits, expenses, fixed, suppliers, returns, movements, reconciliations, raw });
}
