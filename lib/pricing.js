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

export function isPro(shop) {
  return shop?.plan === "pro";
}
