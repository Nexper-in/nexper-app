import { T } from "@/lib/i18n";

// Single source of truth for Nexper Pro pricing and what it unlocks.
// Referenced by the /upgrade page and every gated feature's upsell copy —
// change the number here and it updates everywhere.

export const PRO_PRICING = {
  monthlyInr: 99,
  yearlyInr: 899, // ~24% cheaper than 12x monthly, in line with myBillBook/Vyapar's annual discount
};

export const FREE_FEATURES = [
  T("Billing — search, barcode scan, voice entry"),
  T("Inventory with MRP pricing anchor & stock alerts"),
  T("Udhaar (credit) tracking + UPI QR collection"),
  T("Day Close, Expenses, Cashbook"),
  T("Bulk import & Indian product catalogue"),
  T("GST summary report + CSV export"),
  T("1 staff login (plus you, the owner)"),
];

export const PRO_FEATURES = [
  { key: "extra_staff", label: T("More than 1 staff login"), description: T("Free plan includes the owner + 1 staff member.") },
  { key: "purchase_orders", label: T("Purchase Orders & Suppliers"), description: T("Track supplier orders and receive stock against them.") },
  { key: "gstr1_json", label: T("GSTR-1 filing export (JSON)"), description: T("Upload-ready file for the GST Offline Tool, not just the on-screen summary.") },
  { key: "ocr_scan", label: T("Supplier bill scanning (OCR)"), description: T("Auto-read a supplier's paper bill to update stock instead of typing it in.") },
  { key: "product_photos", label: T("Product photos"), description: T("Add a photo to any item instead of just a category color.") },
];

// Whether Pro is enforced is now a setting on the platform admin page
// (Pricing & tax -> Plan enforcement), not a code constant. Until the admin
// turns it on, every shop is treated as Pro, as before. Everything below reads
// through lib/platformConfig.js.
export { isPro } from "@/lib/platformConfig";
