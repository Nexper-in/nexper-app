// Full data export for the shop owner: one ZIP with a CSV per table and a
// short README. Built in the browser from rows the signed-in owner can already
// read (row-level security applies), so nothing is sent to a server.
import JSZip from "jszip";
import { toCsv } from "@/lib/csv";

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

export async function buildBackupZip(d) {
  const zip = new JSZip();
  const tables = buildTables(d);
  const stamp = new Date().toISOString().slice(0, 10);
  for (const [name, csv] of Object.entries(tables)) zip.file(name, "﻿" + csv); // BOM so Excel reads rupee signs and Indian scripts
  zip.file(
    "README.txt",
    `Nexper backup for ${d.shop?.name || "your shop"}\nExported ${stamp}\n\nOne file per list. Open them in Excel or Google Sheets.\nbills.csv has one row per bill; bill_lines.csv has one row per item sold.\nKeep this file somewhere safe. It contains customer names and phone numbers.\n`
  );
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return { blob, filename: `nexper-backup-${(d.shop?.name || "shop").replace(/[^A-Za-z0-9]+/g, "-")}-${stamp}.zip`, counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, Math.max(0, v.split("\r\n").length - 1)])) };
}
