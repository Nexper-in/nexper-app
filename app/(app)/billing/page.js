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
  BookOpen,
  ChevronDown,
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
  const [showDetails, setShowDetails] = useState(false);
  // Phones: hide the floating checkout bar while the Save bill button is on screen.
  const [billInView, setBillInView] = useState(false);
  useEffect(() => {
    const el = typeof document !== "undefined" ? document.getElementById("save-bill") : null;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // The bottom ~150px is covered by the tab bar and the checkout bar itself.
    const obs = new IntersectionObserver(([entry]) => setBillInView(entry.isIntersecting), { threshold: 1, rootMargin: "0px 0px -150px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading, lastBill, cart.length > 0]);
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
        showToast(`Udhaar bill saved — ${rupee(total)} added to ${customer.name || "customer"}'s balance`);
      }
      // A normal bill needs no toast: the bill panel itself turns into "Bill saved".

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
      setShowDetails(false);
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
    setShowDetails(false);
  }

  // Quick tiles: items marked "quick", then best sellers, in stock only.
  const salesCount = new Map();
  bills.forEach((b) => (b.items || []).forEach((l) => salesCount.set(l.shop_product_id, (salesCount.get(l.shop_product_id) || 0) + l.qty)));
  const quickItems = [...pricedItems]
    .filter((i) => i.stock > 0)
    .sort((a, b) => (b.quick ? 1 : 0) - (a.quick ? 1 : 0) || (salesCount.get(b.id) || 0) - (salesCount.get(a.id) || 0))
    .slice(0, 8);
  const cartQty = cart.reduce((s, c) => s + c.qty, 0);
  const pay = billType === "credit" ? "udhaar" : paymentMethod;
  function choosePay(id) {
    if (id === "udhaar") {
      setBillType("credit");
      setShowDetails(true); // udhaar needs the customer's phone
    } else {
      setBillType("cash");
      setPaymentMethod(id);
    }
  }

  return (
    <div className="pt-4">
      <div className="flex items-baseline justify-between mb-3">
        {/* Phones already show "New bill" in the top bar */}
        <h1 className="ks-display font-bold text-xl hidden lg:block">New bill</h1>
        <span className="ks-mono text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>{nextBillNo}</span>
      </div>

      <div className="ks-billing-grid">
        {/* ── Find items: search, scan or speak; quick tiles below ── */}
        <div>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-secondary)" }} />
            <input
              className="ks-input"
              style={{ paddingLeft: "2.5rem", paddingRight: "5.25rem", paddingTop: 12, paddingBottom: 12, fontSize: 15 }}
              placeholder="Search item or code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1">
              <button
                onClick={startBarcodeScanner}
                aria-label="Scan barcode"
                title="Scan barcode"
                className={`w-9 h-9 rounded-lg flex items-center justify-center ${scannerActive ? "ks-pulse" : ""}`}
                style={{ background: scannerActive ? "var(--accent)" : "var(--bg-surface-alt)", color: scannerActive ? "#fff" : "var(--text-primary)" }}
              >
                <ScanLine size={16} />
              </button>
              <button
                onClick={() => setShowVoiceBilling(true)}
                aria-label="Say the items"
                title="Say the items"
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: "var(--grad)", color: "#fff" }}
              >
                <Mic size={16} />
              </button>
            </div>
          </div>

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
                      {item.stock > 0 ? `${item.stock} ${item.unit} in stock` : "Out of stock"}
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
                  No item called &quot;{query}&quot;
                </div>
              )}
            </div>
          ) : quickItems.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {quickItems.map((item) => (
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
              Search, scan or speak to add items.
            </div>
          )}
        </div>

        {/* ── The bill ── */}
        <div>
          <div id="bill-panel" className="ks-card p-4 sm:p-5 sticky top-20 scroll-mt-20">
            {lastBill && cart.length === 0 ? (
              <div className="ks-pop text-center py-2">
                <CheckCircle2 size={36} className="mx-auto" style={{ color: "var(--success)" }} />
                <p className="font-bold text-lg mt-2">Bill saved</p>
                <p className="ks-mono text-sm" style={{ color: "var(--text-secondary)" }}>
                  {lastBill.bill_no} · {rupee(lastBill.total)}
                  {lastBill.payment_type === "credit" ? " · udhaar" : lastBill.payment_method ? ` · ${lastBill.payment_method.toUpperCase()}` : ""}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    onClick={() => window.open(whatsappLink(lastBill.customer_phone, billMessageText(lastBill, activeShop?.name, activeShop?.gstin)), "_blank")}
                    disabled={!lastBill.customer_phone}
                    className="flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-xl font-semibold disabled:opacity-40"
                    style={{ background: "#25D366", color: "#fff" }}
                  >
                    <MessageCircle size={15} /> WhatsApp
                  </button>
                  <button onClick={() => printBill(lastBill)} className="ks-btn-outline flex items-center justify-center gap-1.5 text-sm py-2.5">
                    <Printer size={15} /> Print
                  </button>
                </div>
                {activeShop?.upi_id && lastBill.payment_method === "upi" && lastBill.payment_type !== "credit" && (
                  <div className="mt-3">
                    <UpiQrCard upiId={activeShop.upi_id} payeeName={activeShop.name} amount={lastBill.total} note={lastBill.bill_no} />
                  </div>
                )}
                <button onClick={clearCart} className="ks-btn-primary w-full mt-3 py-3 flex items-center justify-center gap-2">
                  <Plus size={16} /> New bill
                </button>
              </div>
            ) : (
              <>
                {/* Items */}
                {cart.length === 0 ? (
                  <div className="py-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                    Tap an item to add it to the bill
                  </div>
                ) : (
                  <div className="space-y-2.5 mb-3 max-h-60 overflow-y-auto ks-scroll">
                    {cart.map((c) => (
                      <div key={c.shop_product_id} className="flex items-center gap-2">
                        <span className="text-sm flex-1 font-medium truncate">{c.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => updateQty(c.shop_product_id, c.qty - 1)} className="ks-qtybtn" aria-label={`One less ${c.name}`} style={{ width: 30, height: 30 }}>
                            <Minus size={13} />
                          </button>
                          <span className="ks-mono w-6 text-center text-sm font-bold">{c.qty}</span>
                          <button onClick={() => updateQty(c.shop_product_id, c.qty + 1)} className="ks-qtybtn" aria-label={`One more ${c.name}`} style={{ width: 30, height: 30 }}>
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
                      Total{cartQty > 0 ? ` · ${cartQty} item${cartQty === 1 ? "" : "s"}` : ""}
                    </p>
                    {(discountAmount > 0 || clearanceSavings > 0 || cartGst > 0) && (
                      <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        {[
                          discountAmount > 0 ? `−${rupee(discountAmount)} discount` : null,
                          clearanceSavings > 0 ? `−${rupee(clearanceSavings)} offer` : null,
                          cartGst > 0 ? `incl. GST ${rupee(cartGst)}` : null,
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
                    { id: "cash", label: "Cash", icon: Banknote },
                    { id: "upi", label: "UPI", icon: QrCode },
                    { id: "udhaar", label: "Udhaar", icon: BookOpen },
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
                        Add your UPI ID in Store settings to show a QR here.
                      </p>
                    )}
                  </div>
                )}

                {/* Customer, discount and other payment types, folded away */}
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                  className="w-full flex items-center justify-between text-sm font-semibold py-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span>
                    {customer.name || cleanPhone ? `Customer: ${customer.name || cleanPhone}` : "+ Customer, discount"}
                    {discountAmount > 0 ? ` · −${rupee(discountAmount)}` : ""}
                  </span>
                  <ChevronDown size={16} className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
                </button>

                {showDetails && (
                  <div className="space-y-2 pb-2 ks-fade-up">
                    <input
                      className="ks-input"
                      placeholder="Customer name"
                      value={customer.name}
                      onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    />
                    <input
                      className="ks-input"
                      placeholder={billType === "credit" ? "Phone number (needed for udhaar)" : "Phone number (for WhatsApp bill)"}
                      inputMode="tel"
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    />
                    {isLoyal && (
                      <div className="rounded-xl px-3 py-2 flex items-center justify-between gap-2" style={{ background: "var(--warn-soft)" }}>
                        <span className="text-xs font-semibold text-[var(--warn)]">⭐ Regular customer · visit #{previousVisits + 1}</span>
                        <button
                          onClick={() => setLoyaltyDiscount((v) => !v)}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
                          style={{ background: loyaltyDiscount ? "var(--warn-solid)" : "var(--bg-surface)", color: loyaltyDiscount ? "#fff" : "var(--warn)" }}
                        >
                          {loyaltyDiscount ? "5% off ✓" : "Give 5% off"}
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
                        placeholder="Discount"
                        value={manualDiscount.value}
                        onChange={(e) => setManualDiscount((d) => ({ ...d, value: e.target.value }))}
                        className="ks-input text-sm flex-1"
                      />
                    </div>
                    {billType === "cash" && (
                      <div className="flex gap-1.5 items-center text-xs" style={{ color: "var(--text-secondary)" }}>
                        Paid by
                        {[
                          ["card", "Card", CreditCard],
                          ["bank", "Bank transfer", Landmark],
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
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--danger)" }}>Add the customer&apos;s phone number for udhaar.</p>
                )}

                <button
                  id="save-bill"
                  disabled={cart.length === 0 || generating}
                  onClick={generateBill}
                  className="ks-btn-primary w-full flex items-center justify-center gap-2 py-3.5 text-base mt-1 disabled:opacity-40"
                >
                  {generating ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                  {billType === "credit" ? "Save udhaar bill" : "Save bill"}
                  {total > 0 ? ` · ${rupee(total)}` : ""}
                </button>
                {cart.length > 0 && (
                  <button onClick={clearCart} className="w-full text-sm text-center pt-2.5" style={{ color: "var(--text-secondary)" }}>
                    Clear bill
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

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
                {cartQty} item{cartQty === 1 ? "" : "s"}
              </p>
              <p className="ks-mono text-lg font-extrabold leading-tight">{rupee(total)}</p>
            </div>
            <button
              onClick={() => document.getElementById("bill-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="ks-btn-primary px-5 py-2.5"
            >
              Checkout
            </button>
          </div>
        </>
      )}

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
