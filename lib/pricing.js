// Single source of truth for SabStore Pro pricing and what it unlocks.
// Referenced by the /upgrade page and every gated feature's upsell copy —
// change the number here and it updates everywhere.

export const PRO_PRICING = {
  monthlyInr: 99,
  yearlyInr: 899, // ~24% cheaper than 12x monthly, in line with myBillBook/Vyapar's annual discount
};

export const PRO_FEATURES = [
  { key: "extra_staff", label: "More than 1 staff login", description: "Free plan includes the owner + 1 staff member." },
  { key: "purchase_orders", label: "Purchase Orders & Suppliers", description: "Track supplier orders and receive stock against them." },
  { key: "gstr1_json", label: "GSTR-1 filing export (JSON)", description: "Upload-ready file for the GST Offline Tool, not just the on-screen summary." },
  { key: "ocr_scan", label: "Supplier bill scanning (OCR)", description: "Auto-read a supplier's paper bill to update stock instead of typing it in." },
  { key: "product_photos", label: "Product photos", description: "Add a photo to any item instead of just a category color." },
];

// Paused while the app is still in hands-on testing — every shop is
// treated as Pro so no lock/upgrade UI shows anywhere (Photo URL, Purchase
// Orders/Suppliers, GSTR-1 export, OCR scan, staff limit). The gating
// mechanism, /upgrade page and shops.plan column are all still in place;
// flip this back to `shop?.plan === "pro"` when ready to actually enforce
// the paid tier — every gate reads through this one function, so nothing
// else needs to change.
const GATING_ENABLED = false;

export function isPro(shop) {
  if (!GATING_ENABLED) return true;
  return shop?.plan === "pro";
}
