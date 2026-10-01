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

// Paused while the app is still in hands-on testing — every shop is
// treated as Pro so no lock/upgrade UI shows anywhere (Photo URL, Purchase
// Orders/Suppliers, GSTR-1 export, OCR scan, staff limit). The gating
// mechanism, /upgrade page and shops.plan column are all still in place;
// flip this back to `shop?.plan === "pro"` when ready to actually enforce
// the paid tier — every gate reads through this one function, so nothing
// else needs to change.
export const GATING_ENABLED = false;

export function isPro(shop) {
  if (!GATING_ENABLED) return true;
  return shop?.plan === "pro";
}
