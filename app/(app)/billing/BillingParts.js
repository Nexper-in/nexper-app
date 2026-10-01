"use client";

import {
  Search, Plus, Minus, Mic, Printer, MessageCircle, CheckCircle2, Loader2, ScanLine, Banknote, QrCode, CreditCard, Landmark, BookOpen, ChevronDown,
} from "lucide-react";
import QtyPickerModal from "@/components/QtyPickerModal";
import UpiQrCard from "@/components/UpiQrCard";
import PrintBillContent from "@/components/PrintBillContent";
import VoiceBillingModal from "@/components/VoiceBillingModal";
import { rupee } from "@/lib/format";
import { whatsappLink, billMessageText } from "@/lib/messaging";

// Pieces of New bill shared by the phone and laptop screens.

// Search box with scan and speak buttons.
export function SearchBox({ vm, autoFocus }) {
  const { t, query, setQuery, scannerActive, startBarcodeScanner, setShowVoiceBilling } = vm;
  return (
    <>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-secondary)" }} />
          <input
            className="ks-input"
            style={{ paddingLeft: "2.5rem", paddingRight: "5.25rem", paddingTop: 12, paddingBottom: 12, fontSize: 15 }}
            placeholder={t("Search item or code")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
        autoFocus={autoFocus}
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1">
            <button
              onClick={startBarcodeScanner}
              aria-label={t("Scan barcode")}
              title={t("Scan barcode")}
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${scannerActive ? "ks-pulse" : ""}`}
              style={{ background: scannerActive ? "var(--accent)" : "var(--bg-surface-alt)", color: scannerActive ? "#fff" : "var(--text-primary)" }}
            >
              <ScanLine size={16} />
            </button>
            <button
              onClick={() => setShowVoiceBilling(true)}
              aria-label={t("Say the items")}
              title={t("Say the items")}
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "var(--grad)", color: "#fff" }}
            >
              <Mic size={16} />
            </button>
          </div>
        </div>
    </>
  );
}

// Search results, or the quick item tiles when nothing is typed.
export function FindItems({ vm, wide }) {
  const { t, query, browsing, displayItems, quickItems, setPickerItem } = vm;
  return (
    <>
      {browsing ? (
          <div className="ks-card divide-y divide-[var(--border)] overflow-hidden">
            {displayItems.map((item) => (
              <button
                key={item.id}
                onClick={() => item.stock > 0 && setPickerItem(item)}
                disabled={item.stock <= 0}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-surface-alt)] disabled:opacity-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm truncate">{item.name}</span>
                    {item.clearancePct ? (
                      <span className="ks-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "var(--danger-solid)", color: "#fff" }}>
                        −{item.clearancePct}%
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {item.stock > 0 ? t("{n} {unit} in stock", { n: item.stock, unit: item.unit }) : t("Out of stock")}
                  </p>
                </div>
                <p className="font-bold text-sm shrink-0 ks-mono">
                  {item.originalPrice ? <span className="line-through mr-1 font-normal opacity-60">{rupee(item.originalPrice)}</span> : null}
                  {rupee(item.price)}
                </p>
              </button>
            ))}
            {displayItems.length === 0 && (
              <div className="py-10 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("No item called \"{q}\"", { q: query })}
              </div>
            )}
          </div>
        ) : quickItems.length > 0 ? (
          <div className={wide ? "grid grid-cols-3 xl:grid-cols-4 gap-3" : "grid grid-cols-2 sm:grid-cols-4 gap-2"}>
            {quickItems.slice(0, wide ? 12 : 8).map((item) => (
              <button
                key={item.id}
                onClick={() => setPickerItem(item)}
                className="ks-card text-left px-3 py-3 transition-transform active:scale-[.97]"
              >
                <p className="text-sm font-semibold leading-snug line-clamp-2 min-h-[2.5em]">{item.name}</p>
                <p className="ks-mono text-sm font-bold mt-1" style={{ color: "var(--accent-soft-text)" }}>{rupee(item.price)}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="ks-card py-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("Search, scan or speak to add items.")}
          </div>
        )}
    </>
  );
}

// The bill: items, total, how they pay, customer and Save bill.
// `wide` (laptop) gives the item list more room; `alwaysDetails` keeps the
// customer and discount fields open instead of folded.
export function BillPanel({ vm, wide, alwaysDetails }) {
  const {
    t, activeShop, cart, customer, setCustomer, billType, paymentMethod, loyaltyDiscount, setLoyaltyDiscount,
    manualDiscount, setManualDiscount, lastBill, showDetails, setShowDetails, generating, cleanPhone, previousVisits,
    isLoyal, updateQty, total, discountAmount, clearanceSavings, cartGst, clearCart, cartQty, pay, choosePay,
    generateBill, printBill,
  } = vm;
  const detailsOpen = showDetails || alwaysDetails;
  return (
    <div id="bill-panel" className={`ks-card p-4 sm:p-5 sticky top-20 scroll-mt-20 ${wide ? "max-h-[calc(100vh-6.5rem)] overflow-y-auto ks-scroll" : ""}`}>
      {lastBill && cart.length === 0 ? (
        <div className="ks-pop text-center py-2">
          <CheckCircle2 size={36} className="mx-auto" style={{ color: "var(--success)" }} />
          <p className="font-bold text-lg mt-2">{t("Bill saved")}</p>
          <p className="ks-mono text-sm" style={{ color: "var(--text-secondary)" }}>
            {lastBill.bill_no} · {rupee(lastBill.total)}
            {lastBill.payment_type === "credit" ? ` · ${t("udhaar")}` : lastBill.payment_method ? ` · ${lastBill.payment_method.toUpperCase()}` : ""}
          </p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              onClick={() => window.open(whatsappLink(lastBill.customer_phone, billMessageText(lastBill, activeShop?.name, activeShop?.gstin)), "_blank")}
              disabled={!lastBill.customer_phone}
              className="flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-xl font-semibold disabled:opacity-40"
              style={{ background: "#25D366", color: "#fff" }}
            >
              <MessageCircle size={15} /> {t("WhatsApp")}
            </button>
            <button onClick={() => printBill(lastBill)} className="ks-btn-outline flex items-center justify-center gap-1.5 text-sm py-2.5">
              <Printer size={15} /> {t("Print")}
            </button>
          </div>
          {activeShop?.upi_id && lastBill.payment_method === "upi" && lastBill.payment_type !== "credit" && (
            <div className="mt-3">
              <UpiQrCard upiId={activeShop.upi_id} payeeName={activeShop.name} amount={lastBill.total} note={lastBill.bill_no} />
            </div>
          )}
          <button onClick={clearCart} className="ks-btn-primary w-full mt-3 py-3 flex items-center justify-center gap-2">
            <Plus size={16} /> {t("New bill")}
          </button>
        </div>
      ) : (
        <>
          {/* Items */}
          {cart.length === 0 ? (
            <div className="py-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("Tap an item to add it to the bill")}
            </div>
          ) : (
            <div className={`space-y-2.5 mb-3 ${wide ? "max-h-[42vh]" : "max-h-60"} overflow-y-auto ks-scroll`}>
              {cart.map((c) => (
                <div key={c.shop_product_id} className="flex items-center gap-2">
                  <span className="text-sm flex-1 font-medium truncate">{c.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => updateQty(c.shop_product_id, c.qty - 1)} className="ks-qtybtn" aria-label={t("One less {name}", { name: c.name })} style={{ width: 30, height: 30 }}>
                      <Minus size={13} />
                    </button>
                    <span className="ks-mono w-6 text-center text-sm font-bold">{c.qty}</span>
                    <button onClick={() => updateQty(c.shop_product_id, c.qty + 1)} className="ks-qtybtn" aria-label={t("One more {name}", { name: c.name })} style={{ width: 30, height: 30 }}>
                      <Plus size={13} />
                    </button>
                  </div>
                  <span className="ks-mono text-sm font-semibold w-16 text-right shrink-0">{rupee(c.qty * c.price)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          <div className="flex items-end justify-between py-3 border-t" style={{ borderColor: "var(--border)" }}>
            <div>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {t("Total")}{cartQty > 0 ? ` · ${cartQty === 1 ? t("{n} item", { n: 1 }) : t("{n} items", { n: cartQty })}` : ""}
              </p>
              {(discountAmount > 0 || clearanceSavings > 0 || cartGst > 0) && (
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  {[
                    discountAmount > 0 ? t("−{amt} discount", { amt: rupee(discountAmount) }) : null,
                    clearanceSavings > 0 ? t("−{amt} offer", { amt: rupee(clearanceSavings) }) : null,
                    cartGst > 0 ? t("incl. GST {amt}", { amt: rupee(cartGst) }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            <span className="ks-display text-3xl font-extrabold ks-mono">{rupee(total)}</span>
          </div>

          {/* How they pay */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { id: "cash", label: t("Cash"), icon: Banknote },
              { id: "upi", label: t("UPI"), icon: QrCode },
              { id: "udhaar", label: t("Udhaar"), icon: BookOpen },
            ].map((m) => {
              const on = pay === m.id || (m.id === "cash" && (pay === "card" || pay === "bank"));
              const tone = m.id === "udhaar" ? "var(--udhaar)" : "var(--accent-soft-text)";
              return (
                <button
                  key={m.id}
                  onClick={() => choosePay(m.id)}
                  aria-pressed={on}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl text-sm font-semibold transition-colors"
                  style={
                    on
                      ? { background: m.id === "udhaar" ? "var(--udhaar-soft)" : "var(--accent-soft-bg)", color: tone, border: `1.5px solid ${tone}` }
                      : { background: "var(--bg-surface-alt)", color: "var(--text-secondary)", border: "1.5px solid transparent" }
                  }
                >
                  <m.icon size={18} />
                  {m.label}
                </button>
              );
            })}
          </div>

          {billType === "cash" && paymentMethod === "upi" && total > 0 && (
            <div className="mb-3">
              {activeShop?.upi_id ? (
                <UpiQrCard upiId={activeShop.upi_id} payeeName={activeShop.name} amount={total} note="Checkout" />
              ) : (
                <p className="text-[11px] font-medium text-center py-1" style={{ color: "var(--warn)" }}>
                  {t("Add your UPI ID in Store settings to show a QR here.")}
                </p>
              )}
            </div>
          )}

          {/* Customer, discount and other payment types, folded away */}
          {!alwaysDetails && (
            <button
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="w-full flex items-center justify-between text-sm font-semibold py-2"
              style={{ color: "var(--text-secondary)" }}
            >
              <span>
                {customer.name || cleanPhone ? t("Customer: {name}", { name: customer.name || cleanPhone }) : t("+ Customer, discount")}
                {discountAmount > 0 ? ` · −${rupee(discountAmount)}` : ""}
              </span>
              <ChevronDown size={16} className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </button>
          )}

          {detailsOpen && (
            <div className="space-y-2 pb-2 ks-fade-up">
              <input
                className="ks-input"
                placeholder={t("Customer name")}
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              />
              <input
                className="ks-input"
                placeholder={billType === "credit" ? t("Phone number (needed for udhaar)") : t("Phone number (for WhatsApp bill)")}
                inputMode="tel"
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              />
              {isLoyal && (
                <div className="rounded-xl px-3 py-2 flex items-center justify-between gap-2" style={{ background: "var(--warn-soft)" }}>
                  <span className="text-xs font-semibold text-[var(--warn)]">{t("⭐ Regular customer · visit #{n}", { n: previousVisits + 1 })}</span>
                  <button
                    onClick={() => setLoyaltyDiscount((v) => !v)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
                    style={{ background: loyaltyDiscount ? "var(--warn-solid)" : "var(--bg-surface)", color: loyaltyDiscount ? "#fff" : "var(--warn)" }}
                  >
                    {loyaltyDiscount ? t("5% off ✓") : t("Give 5% off")}
                  </button>
                </div>
              )}
              <div className="flex gap-1.5 items-center">
                <div className="flex p-0.5 rounded-full shrink-0" style={{ background: "var(--bg-surface-alt)" }}>
                  {[
                    ["pct", "%"],
                    ["amt", "₹"],
                  ].map(([t, label]) => (
                    <button
                      key={t}
                      onClick={() => setManualDiscount((d) => ({ ...d, type: t }))}
                      className="text-xs font-bold w-8 py-1.5 rounded-full"
                      style={{ background: manualDiscount.type === t ? "var(--strong)" : "transparent", color: manualDiscount.type === t ? "var(--on-strong)" : "var(--text-secondary)" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder={t("Discount")}
                  value={manualDiscount.value}
                  onChange={(e) => setManualDiscount((d) => ({ ...d, value: e.target.value }))}
                  className="ks-input text-sm flex-1"
                />
              </div>
              {billType === "cash" && (
                <div className="flex gap-1.5 items-center text-xs" style={{ color: "var(--text-secondary)" }}>
                  {t("Paid by")}
                  {[
                    ["card", t("Card"), CreditCard],
                    ["bank", t("Bank transfer"), Landmark],
                  ].map(([id, label, Icon]) => (
                    <button
                      key={id}
                      onClick={() => choosePay(paymentMethod === id ? "cash" : id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-full font-semibold"
                      style={
                        paymentMethod === id
                          ? { background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }
                          : { background: "var(--bg-surface-alt)" }
                      }
                    >
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {billType === "credit" && !cleanPhone && (
            <p className="text-xs font-medium mb-2" style={{ color: "var(--danger)" }}>{t("Add the customer's phone number for udhaar.")}</p>
          )}

          <button
            id="save-bill"
            disabled={cart.length === 0 || generating}
            onClick={generateBill}
            className="ks-btn-primary w-full flex items-center justify-center gap-2 py-3.5 text-base mt-1 disabled:opacity-40"
          >
            {generating ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
            {billType === "credit" ? t("Save udhaar bill") : t("Save bill")}
            {total > 0 ? ` · ${rupee(total)}` : ""}
          </button>
          {cart.length > 0 && (
            <button onClick={clearCart} className="w-full text-sm text-center pt-2.5" style={{ color: "var(--text-secondary)" }}>
              {t("Clear bill")}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Phones only: total and Checkout stay at hand while items are added.
export function CheckoutBar({ vm }) {
  const { t, cart, billInView, cartQty, total } = vm;
  return (
    <>
      {/* Phones: total and checkout always at hand while adding items */}
      {/* Spacer is fixed while items are in the bill, so showing or hiding the
          bar never shifts the page (which would make it flicker). */}
      {cart.length > 0 && <div className="lg:hidden h-16" />}
      {cart.length > 0 && !billInView && (
        <>
          <div className="ks-no-print lg:hidden fixed left-3 right-3 z-20 ks-card flex items-center justify-between gap-3 px-4 py-2.5 ks-fade-up"
            style={{ bottom: "calc(74px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 12px 30px rgba(0,0,0,0.35)" }}
          >
            <div>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {cartQty === 1 ? t("{n} item", { n: 1 }) : t("{n} items", { n: cartQty })}
              </p>
              <p className="ks-mono text-lg font-extrabold leading-tight">{rupee(total)}</p>
            </div>
            <button
              onClick={() => document.getElementById("bill-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="ks-btn-primary px-5 py-2.5"
            >
              {t("Checkout")}
            </button>
          </div>
        </>
      )}
    </>
  );
}

// Printable copy of the last bill, and the pop-ups.
export function BillingModals({ vm }) {
  const { activeShop, lastBill, showVoiceBilling, setShowVoiceBilling, pricedItems, handleVoiceBillingConfirm, pickerItem, setPickerItem, addToCart } = vm;
  return (
    <>
      {lastBill && (
        <div className="ks-print-only">
          <PrintBillContent bill={lastBill} storeName={activeShop?.name} gstin={activeShop?.gstin} />
        </div>
      )}

      {showVoiceBilling && (
        <VoiceBillingModal items={pricedItems} onConfirm={handleVoiceBillingConfirm} onClose={() => setShowVoiceBilling(false)} />
      )}
      {pickerItem && (
        <QtyPickerModal
          item={pickerItem}
          onClose={() => setPickerItem(null)}
          onConfirm={(qty) => { addToCart(pickerItem, qty); setPickerItem(null); }}
        />
      )}
    </>
  );
}
