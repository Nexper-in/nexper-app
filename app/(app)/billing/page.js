"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Minus,
  Mic,
  Printer,
  MessageCircle,
  CheckCircle2,
  Loader2,
  ScanLine,
  Banknote,
  QrCode,
  CreditCard,
  Landmark,
} from "lucide-react";
import { useShop } from "@/components/ShopContext";
import ItemThumb from "@/components/ItemThumb";
import { categoryColor } from "@/components/CategoryChip";
import QtyPickerModal from "@/components/QtyPickerModal";
import UpiQrCard from "@/components/UpiQrCard";
import PrintBillContent from "@/components/PrintBillContent";
import { rupee } from "@/lib/format";
import { whatsappLink, billMessageText, taxBreakup } from "@/lib/messaging";
import { parseSpokenQuantity, matchItemFromSpeech } from "@/lib/voiceHelpers";
import VoiceBillingModal from "@/components/VoiceBillingModal";
import { fetchShopItems } from "@/lib/products";
import { fetchActiveOffers, activeDiscountMap, clearancePrice } from "@/lib/clearance";
import { cacheProducts, getCachedProducts, cacheBills, getCachedBills } from "@/lib/productCache";
import ModuleGuard from "@/components/ModuleGuard";

export default function BillingPage() {
  return (
    <ModuleGuard module="billing">
      <BillingPageInner />
    </ModuleGuard>
  );
}

function BillingPageInner() {
  const { supabase, activeShopId, activeShop, showToast, runQueued } = useShop();
  const [items, setItems] = useState([]);
  const [bills, setBills] = useState([]);
  const [discountMap, setDiscountMap] = useState(new Map());
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [billType, setBillType] = useState("cash");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(false);
  const [manualDiscount, setManualDiscount] = useState({ type: "pct", value: "" });
  const [lastBill, setLastBill] = useState(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [pickerItem, setPickerItem] = useState(null);
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [voiceLang, setVoiceLang] = useState("en-IN");
  const [generating, setGenerating] = useState(false);
  const [showVoiceBilling, setShowVoiceBilling] = useState(false);
  const recognitionRef = useRef(null);
  const voiceSupported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);

    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

    if (!isOnline) {
      // Serve products and bills from localStorage — enough to make a bill
      // and do loyal-customer detection without any network call.
      const cachedItems = getCachedProducts(activeShopId);
      const cachedBillsList = getCachedBills(activeShopId);
      if (cachedItems) setItems(cachedItems);
      if (cachedBillsList) setBills(cachedBillsList);
      setLoading(false);
      return;
    }

    const [itemsData, { data: billsData }, offersData] = await Promise.all([
      fetchShopItems(supabase, activeShopId),
      supabase.from("bills").select("*").eq("shop_id", activeShopId).order("date", { ascending: false }),
      fetchActiveOffers(supabase, activeShopId),
    ]);
    setItems(itemsData);
    setBills(billsData || []);
    setDiscountMap(activeDiscountMap(offersData));

    // Write to cache so the next offline session has fresh data
    cacheProducts(activeShopId, itemsData);
    cacheBills(activeShopId, billsData || []);

    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  // Items priced for sale right now — clearance offers whose date range
  // covers today are baked in here so every tile, search result, and the
  // voice-match list all see the discounted price with no separate path.
  const pricedItems = useMemo(
    () =>
      items.map((i) => {
        const offer = discountMap.get(i.id);
        if (!offer) return i;
        return { ...i, price: clearancePrice(i.price, offer.pct), originalPrice: i.price, clearancePct: offer.pct };
      }),
    [items, discountMap]
  );

  const categories = [...new Set(pricedItems.map((i) => i.category))];

  const cleanPhone = (customer.phone || "").replace(/\D/g, "");
  const previousVisits = cleanPhone ? bills.filter((b) => (b.customer_phone || "").replace(/\D/g, "") === cleanPhone).length : 0;
  const isLoyal = previousVisits >= 3;

  function handleVoiceTranscript(transcript) {
    const item = matchItemFromSpeech(pricedItems, transcript);
    if (!item) return showToast(`Couldn't match "${transcript}" to an item`, "warn");
    const qty = parseSpokenQuantity(transcript, item.unit);
    if (qty && qty > 0) {
      addToCart(item, qty);
      showToast(`🎙️ Added ${qty}${item.unit} ${item.name}`);
    } else {
      setPickerItem(item);
    }
  }

  function startVoiceAdd() {
    if (!voiceSupported) return showToast("Voice input isn't supported in this browser", "err");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    try {
      recognition = new SR();
    } catch (e) {
      showToast("Couldn't start voice input on this device", "err");
      return;
    }
    recognition.lang = voiceLang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onerror = (e) => {
      setListening(false);
      const messages = {
        "not-allowed": "Microphone access is blocked — allow it for this site in your browser settings",
        "service-not-allowed": "Microphone isn't available in this preview window — try it once the app is opened on its own page/tab",
        "audio-capture": "No microphone was found on this device",
        "no-speech": "Didn't hear anything — try again",
        network: "Voice input needs an internet connection",
        aborted: "Voice input was stopped",
      };
      showToast(messages[e.error] || `Voice input error: ${e.error || "unknown"}`, "err");
    };
    recognition.onend = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setLastHeard(transcript);
      handleVoiceTranscript(transcript);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      setListening(false);
      showToast("Couldn't start listening — try tapping the mic again", "err");
    }
  }

  function addToCart(item, qty = 1) {
    if (item.stock <= 0) return showToast(`${item.name} is out of stock`, "err");
    setCart((prev) => {
      const exists = prev.find((c) => c.shop_product_id === item.id);
      const wanted = (exists ? exists.qty : 0) + qty;
      if (wanted > item.stock) {
        showToast(`Only ${item.stock} ${item.unit} of ${item.name} in stock`, "warn");
        const capped = item.stock;
        return exists
          ? prev.map((c) => (c.shop_product_id === item.id ? { ...c, qty: capped } : c))
          : [
              ...prev,
              {
                shop_product_id: item.id,
                code: item.code,
                name: item.name,
                price: item.price,
                mrp: item.mrp || null,
                originalPrice: item.originalPrice || null,
                clearancePct: item.clearancePct || null,
                unit: item.unit,
                gst: item.gst,
                qty: capped,
                stock: item.stock,
              },
            ];
      }
      if (exists) return prev.map((c) => (c.shop_product_id === item.id ? { ...c, qty: wanted } : c));
      return [
        ...prev,
        {
          shop_product_id: item.id,
          code: item.code,
          name: item.name,
          price: item.price,
          mrp: item.mrp || null,
          originalPrice: item.originalPrice || null,
          clearancePct: item.clearancePct || null,
          unit: item.unit,
          gst: item.gst,
          qty,
          stock: item.stock,
        },
      ];
    });
    setQuery("");
  }

  function updateQty(id, qty) {
    const line = cart.find((c) => c.shop_product_id === id);
    if (!line) return;
    if (qty > line.stock) {
      showToast(`Only ${line.stock} ${line.unit} in stock`, "warn");
      qty = line.stock;
    }
    if (qty <= 0) setCart((prev) => prev.filter((c) => c.shop_product_id !== id));
    else setCart((prev) => prev.map((c) => (c.shop_product_id === id ? { ...c, qty } : c)));
  }

  const subtotal = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const loyaltyDiscountAmount = loyaltyDiscount ? Math.round(subtotal * 0.05) : 0;
  const manualDiscountAmount = (() => {
    const v = parseFloat(manualDiscount.value) || 0;
    if (v <= 0) return 0;
    const raw = manualDiscount.type === "pct" ? Math.round((v / 100) * subtotal) : Math.round(v);
    return Math.min(raw, subtotal);
  })();
  const discountAmount = loyaltyDiscountAmount + manualDiscountAmount;
  const total = subtotal - discountAmount;
  const clearanceSavings = cart.reduce((s, c) => s + (c.originalPrice ? (c.originalPrice - c.price) * c.qty : 0), 0);

  async function generateBill() {
    if (cart.length === 0) return;
    if (billType === "credit" && !cleanPhone) return showToast("Add a customer mobile number for udhaar bills", "err");

    setGenerating(true);
    try {
      const billNo = `KS-${1000 + bills.length + 1}`;
      const billItems = cart.map(({ shop_product_id, code, name, price, mrp, unit, gst, qty }) => {
        const inv = items.find((i) => i.id === shop_product_id);
        return { shop_product_id, code, name, price, mrp: mrp || null, unit, gst, qty, cost_price: inv?.cost_price ?? null };
      });
      // Built client-side (including the id) so a queued/offline bill can
      // be shown, printed, and sent immediately — it reconciles with the
      // real row once runQueued's background flush actually writes it.
      const bill = {
        id: crypto.randomUUID(),
        shop_id: activeShopId,
        bill_no: billNo,
        customer_name: customer.name || null,
        customer_phone: cleanPhone || null,
        items: billItems,
        subtotal,
        discount_amount: discountAmount,
        total,
        payment_type: billType,
        payment_method: billType === "credit" ? "cash" : paymentMethod,
        date: new Date().toISOString(),
      };

      // Stock is validated/deducted BEFORE the bill row is written. If an
      // item has gone out of stock (e.g. another sale beat this one to it),
      // sell_items throws and we stop here — no bill is ever created, the
      // cart stays intact, and the cashier sees exactly what to fix.
      // Writing the bill first would leave an orphaned bill row with no
      // matching stock deduction whenever sell_items rejected the sale.
      const stockResult = await runQueued({
        type: "rpc",
        fn: "sell_items",
        args: { p_shop_id: activeShopId, p_lines: billItems },
      });

      // bill_no is a client-guessed number (bills.length + 1), so another
      // device/tab can guess the same one before either syncs — a
      // "bills_shop_id_bill_no_key" unique-violation (23505) means exactly
      // that happened. Regenerate and retry once rather than failing a
      // sale whose stock has *already* been deducted above.
      let billResult;
      try {
        billResult = await runQueued({ type: "insert", table: "bills", rows: [bill] });
      } catch (err) {
        if (err?.code === "23505") {
          bill.bill_no = `${billNo}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
          billResult = await runQueued({ type: "insert", table: "bills", rows: [bill] });
        } else {
          throw err;
        }
      }
      const offline = billResult.queued || stockResult.queued;

      if (billType === "credit") {
        await runQueued({
          type: "insert",
          table: "credits",
          rows: [{ shop_id: activeShopId, phone: cleanPhone, name: customer.name || "Customer", amount: total, type: "charge", note: `Bill ${bill.bill_no}` }],
        });
      }

      if (offline) {
        showToast("You're offline — this bill will sync automatically once you're back online", "warn");
      } else if (billType === "credit") {
        showToast(`Bill generated on udhaar — ${rupee(total)} added to ${customer.name || "customer"}'s balance`);
      } else {
        showToast("Bill generated");
      }

      setItems((prev) =>
        prev.map((p) => {
          const line = cart.find((c) => c.shop_product_id === p.id);
          return line ? { ...p, stock: Math.max(0, p.stock - line.qty) } : p;
        })
      );
      setBills((prev) => [bill, ...prev]);
      setLastBill(bill);
      setCart([]);
      setCustomer({ name: "", phone: "" });
      setBillType("cash");
      setLoyaltyDiscount(false);
      setManualDiscount({ type: "pct", value: "" });
    } catch (err) {
      showToast(err.message, "err");
    } finally {
      setGenerating(false);
    }
  }

  function handleVoiceBillingConfirm(voiceCart, voiceBillType) {
    setCart(voiceCart.map(({ item, qty }) => ({
      shop_product_id: item.id,
      code: item.code,
      name: item.name,
      price: item.price,
      mrp: item.mrp || null,
      originalPrice: item.originalPrice || null,
      clearancePct: item.clearancePct || null,
      unit: item.unit,
      gst: item.gst,
      qty,
      stock: item.stock,
    })));
    setBillType(voiceBillType);
    setShowVoiceBilling(false);
  }

  function startBarcodeScanner() {
    if (!("BarcodeDetector" in window)) {
      showToast("Barcode scanner not supported in this browser — search by code or name instead", "warn");
      return;
    }
    setScannerActive(true);
    let active = true;
    const detector = new window.BarcodeDetector({ formats: ["code_128", "ean_13", "ean_8", "code_39", "qr_code"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((stream) => {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.play();
      const scan = () => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        detector.detect(video).then((codes) => {
          if (codes.length > 0) {
            const val = codes[0].rawValue;
            stream.getTracks().forEach((t) => t.stop());
            active = false;
            setScannerActive(false);
            const matched = pricedItems.find((i) => i.barcode === val || i.code === val || i.code === val.slice(-2));
            if (matched) {
              setPickerItem(matched);
            } else {
              setQuery(val);
              showToast(`Scanned: ${val} — no exact match, showing search results`);
            }
          } else {
            requestAnimationFrame(scan);
          }
        }).catch(() => requestAnimationFrame(scan));
      };
      video.onloadeddata = scan;
    }).catch(() => {
      active = false;
      setScannerActive(false);
      showToast("Camera access denied — allow it in browser settings", "err");
    });
  }

  function printBill(bill) {
    setLastBill(bill);
    setTimeout(() => window.print(), 50);
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading billing…
      </div>
    );
  }

  // Search or category driven — no permanent catalog browsing. Nothing
  // shows until the cashier searches, scans, or picks a category.
  const displayItems = query
    ? pricedItems.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()) || i.code === query.trim())
    : activeCategory
    ? pricedItems.filter((i) => i.category === activeCategory)
    : [];
  const browsing = query.trim().length > 0 || !!activeCategory;

  // GST extracted from cart (prices are GST-inclusive)
  const cartGst = cart.reduce((s, c) => {
    if (!c.gst) return s;
    return s + Math.round(c.qty * c.price * c.gst / (100 + c.gst));
  }, 0);

  const nextBillNo = `KS-${1000 + bills.length + 1}`;

  function clearCart() {
    setCart([]);
    setCustomer({ name: "", phone: "" });
    setBillType("cash");
    setLoyaltyDiscount(false);
    setManualDiscount({ type: "pct", value: "" });
    setLastBill(null);
    setQuery("");
    setActiveCategory(null);
  }

  return (
    <div className="pt-4">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="ks-display font-bold text-xl">New Sale</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
          </span>
          <button onClick={clearCart} className="ks-btn-primary flex items-center gap-1.5 text-sm py-2">
            <Plus size={14} /> New Sale
          </button>
        </div>
      </div>

      <div className="ks-billing-grid">
        {/* ── Left: search / scan / voice to find an item ── */}
        <div>
          {/* Search + category + voice */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-secondary)" }} />
              <input
                className="ks-input"
                style={{ paddingLeft: "2.25rem", paddingRight: "2.5rem" }}
                placeholder="Search products..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                onClick={startBarcodeScanner}
                title="Scan barcode"
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center ${scannerActive ? "ks-pulse" : ""}`}
                style={{ background: scannerActive ? "var(--accent)" : "transparent", color: scannerActive ? "#fff" : "var(--text-secondary)" }}
              >
                <ScanLine size={14} />
              </button>
            </div>
            <select
              className="ks-input shrink-0"
              style={{ width: "148px" }}
              value={activeCategory || ""}
              onChange={(e) => setActiveCategory(e.target.value || null)}
            >
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={() => setShowVoiceBilling(true)}
              title="Voice billing"
              className="w-10 h-10 flex items-center justify-center rounded-xl shrink-0"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <Mic size={16} />
            </button>
          </div>

          {/* Search / category results — a list, not a browsable catalog */}
          {browsing ? (
            <div className="ks-card divide-y divide-[var(--border)] overflow-hidden">
              {displayItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => item.stock > 0 && setPickerItem(item)}
                  disabled={item.stock <= 0}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-surface-alt)] disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm truncate">{item.name}</span>
                      {item.clearancePct ? (
                        <span className="ks-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "var(--danger-solid)", color: "#fff" }}>
                          −{item.clearancePct}%
                        </span>
                      ) : item.mrp > item.price ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
                          {Math.round(((item.mrp - item.price) / item.mrp) * 100)}% OFF
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{item.category}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm" style={{ color: "var(--warn)" }}>
                      {item.originalPrice ? (
                        <span className="line-through mr-1 font-normal opacity-60">{rupee(item.originalPrice)}</span>
                      ) : item.mrp > item.price ? (
                        <span className="line-through mr-1 font-normal opacity-60">{rupee(item.mrp)}</span>
                      ) : null}
                      {rupee(item.price)}
                      <span className="font-normal text-[11px] ml-0.5">/{item.unit}</span>
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      {item.stock > 0 ? `${item.stock} in stock` : "Out of stock"}
                    </p>
                  </div>
                </button>
              ))}
              {displayItems.length === 0 && (
                <div className="py-10 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                  No products found
                </div>
              )}
            </div>
          ) : (
            <div className="ks-card py-14 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
              Search a product, scan a barcode, or pick a category to add it to the bill.
            </div>
          )}
        </div>

        {/* ── Right: current bill panel ── */}
        <div>
          <div className="ks-card p-5 sticky top-20">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">Current Bill</h2>
              <span className="ks-mono text-sm font-bold" style={{ color: "var(--warn)" }}>{nextBillNo}</span>
            </div>

            {/* Cart items */}
            {cart.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                Tap a product to add it
              </div>
            ) : (
              <div className="space-y-2.5 mb-4 max-h-52 overflow-y-auto ks-scroll">
                {cart.map((c) => (
                  <div key={c.shop_product_id} className="flex items-center gap-2">
                    <span className="text-sm flex-1 font-medium truncate">{c.name}</span>
                    {c.clearancePct && (
                      <span className="ks-mono text-[9px] font-bold px-1 py-0.5 rounded-full shrink-0" style={{ background: "var(--danger-solid)", color: "#fff" }}>
                        −{c.clearancePct}%
                      </span>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => updateQty(c.shop_product_id, c.qty - 1)} className="ks-qtybtn"><Minus size={11} /></button>
                      <span className="ks-mono w-5 text-center text-xs font-bold">{c.qty}</span>
                      <button onClick={() => updateQty(c.shop_product_id, c.qty + 1)} className="ks-qtybtn"><Plus size={11} /></button>
                    </div>
                    <span className="ks-mono text-xs font-semibold w-14 text-right shrink-0">{rupee(c.qty * c.price)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            {cart.length > 0 && (
              <div className="py-3 border-t border-b mb-4 space-y-1.5" style={{ borderColor: "var(--border)" }}>
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span className="ks-mono">{rupee(subtotal)}</span>
                </div>
                {cartGst > 0 && (
                  <div className="flex justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
                    <span>GST</span>
                    <span className="ks-mono">{rupee(cartGst)}</span>
                  </div>
                )}
                {clearanceSavings > 0 && (
                  <div className="flex justify-between text-xs" style={{ color: "var(--danger)" }}>
                    <span>Clearance savings</span>
                    <span className="ks-mono">−{rupee(clearanceSavings)}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-xs" style={{ color: "var(--warn)" }}>
                    <span>Discount</span>
                    <span className="ks-mono">−{rupee(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1">
                  <span>Total</span>
                  <span className="ks-mono">{rupee(total)}</span>
                </div>
              </div>
            )}

            {/* Customer */}
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Customer Name (Optional)
            </p>
            <input
              className="ks-input mb-2"
              placeholder="Walk-in Customer"
              value={customer.name}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
            />
            <input
              className="ks-input mb-3"
              placeholder="Phone number"
              value={customer.phone}
              onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
            />

            {/* Loyalty */}
            {isLoyal && (
              <div className="rounded-xl px-3 py-2 mb-3 flex items-center justify-between gap-2" style={{ background: "var(--warn-soft)" }}>
                <span className="text-xs font-semibold text-[var(--warn)]">⭐ Loyal · visit #{previousVisits + 1}</span>
                <button
                  onClick={() => setLoyaltyDiscount((v) => !v)}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: loyaltyDiscount ? "var(--warn-solid)" : "var(--bg-surface)", color: loyaltyDiscount ? "#fff" : "var(--warn)" }}
                >
                  {loyaltyDiscount ? "5% ✓" : "Apply 5%"}
                </button>
              </div>
            )}

            {/* Extra discount */}
            <div className="flex gap-1.5 items-center mb-3">
              <button
                onClick={() => setManualDiscount((d) => ({ ...d, type: "pct" }))}
                className="text-xs font-bold px-2.5 py-1.5 rounded-full shrink-0"
                style={{ background: manualDiscount.type === "pct" ? "var(--strong)" : "var(--bg-surface-alt)", color: manualDiscount.type === "pct" ? "var(--on-strong)" : "var(--text-secondary)" }}
              >%</button>
              <button
                onClick={() => setManualDiscount((d) => ({ ...d, type: "amt" }))}
                className="text-xs font-bold px-2.5 py-1.5 rounded-full shrink-0"
                style={{ background: manualDiscount.type === "amt" ? "var(--strong)" : "var(--bg-surface-alt)", color: manualDiscount.type === "amt" ? "var(--on-strong)" : "var(--text-secondary)" }}
              >₹</button>
              <input
                type="number"
                min="0"
                placeholder="Discount"
                value={manualDiscount.value}
                onChange={(e) => setManualDiscount((d) => ({ ...d, value: e.target.value }))}
                className="ks-input text-sm py-1.5 flex-1"
              />
            </div>

            {/* Payment type */}
            <div className="flex gap-1.5 mb-3 p-1 rounded-full" style={{ background: "var(--bg-surface-alt)" }}>
              <button
                onClick={() => setBillType("cash")}
                className="flex-1 text-xs font-semibold py-1.5 rounded-full transition-colors"
                style={{ background: billType === "cash" ? "var(--strong)" : "transparent", color: billType === "cash" ? "var(--on-strong)" : "var(--text-secondary)" }}
              >
                Cash / Paid
              </button>
              <button
                onClick={() => setBillType("credit")}
                className="flex-1 text-xs font-semibold py-1.5 rounded-full transition-colors"
                style={{ background: billType === "credit" ? "var(--udhaar-solid)" : "transparent", color: billType === "credit" ? "#fff" : "var(--text-secondary)" }}
              >
                Udhaar
              </button>
            </div>
            {billType === "credit" && !cleanPhone && (
              <p className="text-[11px] font-medium mb-2" style={{ color: "var(--danger)" }}>Add a phone number for udhaar.</p>
            )}

            {/* Payment method — only meaningful once money has actually changed hands */}
            {billType === "cash" && (
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {[
                  { id: "cash", label: "Cash", icon: Banknote },
                  { id: "upi", label: "UPI", icon: QrCode },
                  { id: "card", label: "Card", icon: CreditCard },
                  { id: "bank", label: "Bank", icon: Landmark },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id)}
                    className="flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-semibold transition-colors"
                    style={
                      paymentMethod === m.id
                        ? { background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)", border: "1.5px solid var(--accent)" }
                        : { background: "var(--bg-surface-alt)", color: "var(--text-secondary)", border: "1.5px solid transparent" }
                    }
                  >
                    <m.icon size={15} />
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {/* UPI QR at checkout — shown as soon as UPI is picked, using the
                live cart total, so the customer can scan and pay while the
                bill is being finalized instead of waiting for the receipt. */}
            {billType === "cash" && paymentMethod === "upi" && total > 0 && (
              <div className="mb-3">
                {activeShop?.upi_id ? (
                  <UpiQrCard upiId={activeShop.upi_id} payeeName={activeShop.name} amount={total} note="Checkout" />
                ) : (
                  <p className="text-[11px] font-medium text-center py-2" style={{ color: "var(--danger)" }}>
                    Add a UPI ID in Store settings to show a QR code here.
                  </p>
                )}
              </div>
            )}

            {/* Generate Bill */}
            <button
              disabled={cart.length === 0 || generating}
              onClick={generateBill}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm mb-2 disabled:opacity-40 transition-opacity"
              style={{ background: "var(--grad)", color: "#ffffff", boxShadow: "0 12px 28px -14px rgba(236, 72, 153, 0.8)" }}
            >
              {generating ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {billType === "credit" ? "Generate Udhaar Bill" : "Generate Bill"}
            </button>

            {cart.length > 0 && (
              <button onClick={clearCart} className="w-full text-sm text-center py-1" style={{ color: "var(--text-secondary)" }}>
                Clear Cart
              </button>
            )}

            {/* Last bill actions */}
            {lastBill && (
              <div className="mt-4 pt-4 border-t ks-pop" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={16} style={{ color: "var(--accent-soft-text)" }} />
                  <p className="text-sm font-bold" style={{ color: "var(--accent-soft-text)" }}>Bill generated!</p>
                  <span className="ks-mono text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>{lastBill.bill_no} · {rupee(lastBill.total)}</span>
                </div>
                {taxBreakup(lastBill.items).taxAmt > 0 && (
                  <p className="text-[11px] mb-2 ks-mono" style={{ color: "var(--text-secondary)" }}>
                    GST {rupee(taxBreakup(lastBill.items).taxAmt)} included
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => printBill(lastBill)} className="ks-btn-outline flex items-center justify-center gap-1.5 text-xs py-2">
                    <Printer size={13} /> Print
                  </button>
                  <button
                    onClick={() => window.open(whatsappLink(lastBill.customer_phone, billMessageText(lastBill, activeShop?.name, activeShop?.gstin)), "_blank")}
                    disabled={!lastBill.customer_phone}
                    className="flex items-center justify-center gap-1.5 text-xs py-2 rounded-xl font-semibold disabled:opacity-40"
                    style={{ background: "#25D366", color: "#fff" }}
                  >
                    <MessageCircle size={13} /> WhatsApp
                  </button>
                </div>
                {activeShop?.upi_id && lastBill.payment_method === "upi" && (
                  <div className="mt-3">
                    <UpiQrCard upiId={activeShop.upi_id} payeeName={activeShop.name} amount={lastBill.total} note={lastBill.bill_no} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}
