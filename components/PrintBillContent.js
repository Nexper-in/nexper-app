import { rupee } from "@/lib/format";
import { taxBreakup } from "@/lib/messaging";

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}
function threeDigits(n) {
  if (n < 100) return twoDigits(n);
  return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + twoDigits(n % 100) : "");
}
// Indian numbering (crore/lakh/thousand) — the grouping a customer here
// expects, not the Western thousand/million split.
function numberToWords(num) {
  num = Math.round(num);
  if (num === 0) return "Zero";
  let result = "";
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  if (crore) result += threeDigits(crore) + " Crore ";
  if (lakh) result += threeDigits(lakh) + " Lakh ";
  if (thousand) result += threeDigits(thousand) + " Thousand ";
  if (num) result += threeDigits(num);
  return result.trim();
}

export default function PrintBillContent({ bill, storeName, gstin, groupUrl }) {
  const { taxable, taxAmt } = taxBreakup(bill.items);
  const halfTax = Math.round((taxAmt / 2) * 100) / 100;
  const discount = bill.discount_amount || 0;
  // MRP anchor savings — separate from the bill's own discount_amount
  // (loyalty/manual/clearance), this is what the customer saved simply
  // by buying here vs. paying printed MRP.
  const mrpSavings = (bill.items || []).reduce((s, it) => (it.mrp > it.price ? s + (it.mrp - it.price) * it.qty : s), 0);

  return (
    <div style={{ width: "100%", maxWidth: "740px", margin: "0 auto", padding: "36px 40px", fontFamily: "'DM Sans', 'Inter', sans-serif", color: "#1A1D29", fontSize: "13px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 18, borderBottom: "2px solid #1A1D29" }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>{storeName}</div>
          {gstin && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>GSTIN: {gstin}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.06em", color: "#2A4CDB" }}>
            {bill.payment_type === "credit" ? "CREDIT INVOICE" : "TAX INVOICE"}
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>Original for Recipient</div>
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 24, padding: "16px 0", borderBottom: "1px solid #E5E7EB" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 4 }}>INVOICE DETAILS</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{bill.bill_no}</div>
          <div style={{ color: "#6B7280", marginTop: 2 }}>{new Date(bill.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 4 }}>BILLED TO</div>
          <div style={{ fontWeight: 600 }}>{bill.customer_name || "Customer"}</div>
          {bill.customer_phone && (
            <div style={{ color: "#6B7280", marginTop: 2 }}>
              {"X".repeat(Math.max(bill.customer_phone.length - 4, 0)) + bill.customer_phone.slice(-4)}
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}>
        <thead>
          <tr style={{ background: "#F1F2F5" }}>
            <td style={{ padding: "8px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "#6B7280" }}>#</td>
            <td style={{ padding: "8px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "#6B7280" }}>ITEM</td>
            <td style={{ padding: "8px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "#6B7280", textAlign: "center" }}>QTY</td>
            <td style={{ padding: "8px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "#6B7280", textAlign: "right" }}>RATE</td>
            <td style={{ padding: "8px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "#6B7280", textAlign: "right" }}>AMOUNT</td>
          </tr>
        </thead>
        <tbody>
          {(bill.items || []).map((it, idx) => (
            <tr key={it.shop_product_id || idx} style={{ borderBottom: "1px solid #F1F2F5" }}>
              <td style={{ padding: "8px 6px", color: "#9CA3AF" }}>{idx + 1}</td>
              <td style={{ padding: "8px 6px", fontWeight: 500 }}>{it.name}</td>
              <td style={{ padding: "8px 6px", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace" }}>{it.qty}{it.unit}</td>
              <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>
                {it.mrp > it.price && (
                  <span style={{ textDecoration: "line-through", opacity: 0.5, marginRight: 4 }}>{rupee(it.mrp)}</span>
                )}
                {rupee(it.price)}
              </td>
              <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{rupee(it.qty * it.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <div style={{ width: "280px" }}>
          {taxAmt > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#6B7280" }}>
                <span>Taxable value</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{rupee(taxable)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#6B7280" }}>
                <span>CGST</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{rupee(halfTax)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#6B7280" }}>
                <span>SGST</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{rupee(taxAmt - halfTax)}</span>
              </div>
            </>
          )}
          {discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#C13F45" }}>
              <span>Discount</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>−{rupee(discount)}</span>
            </div>
          )}
          {mrpSavings > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#1F8A5F", fontWeight: 600 }}>
              <span>You saved (vs MRP)</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{rupee(mrpSavings)}</span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 8,
              padding: "10px 12px",
              background: "#1A1D29",
              color: "#fff",
              borderRadius: 6,
            }}
          >
            <span style={{ fontWeight: 700 }}>Total</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 16 }}>{rupee(bill.total)}</span>
          </div>
        </div>
      </div>

      {/* Amount in words */}
      <div style={{ marginTop: 14, fontSize: 12, color: "#6B7280" }}>
        <span style={{ fontWeight: 600, color: "#1A1D29" }}>Amount in words: </span>
        Rupees {numberToWords(bill.total)} Only
      </div>

      {/* Footer */}
      <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px dashed #D1D5DB", textAlign: "center" }}>
        <div style={{ fontWeight: 600 }}>Thank you for shopping with us!</div>
        {groupUrl && <div style={{ fontSize: 10, marginTop: 4 }}>Join our WhatsApp group for offers: {groupUrl}</div>}
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>This is a computer-generated invoice and does not require a signature.</div>
      </div>
    </div>
  );
}
