"use client";

import { SearchBox, FindItems, BillPanel, CheckoutBar } from "./BillingParts";

// Phone view: find items, then the bill below; customer and discount stay
// folded and a checkout bar follows you while the Save button is off screen.
export default function BillingMobile({ vm }) {
  const { nextBillNo } = vm;
  return (
    <div className="pt-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="ks-mono text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>{nextBillNo}</span>
      </div>
      <div className="grid gap-5">
        <div>
          <div className="relative mb-3">
            <SearchBox vm={vm} />
          </div>
          <FindItems vm={vm} />
        </div>
        <BillPanel vm={vm} />
      </div>
      <CheckoutBar vm={vm} />
    </div>
  );
}
