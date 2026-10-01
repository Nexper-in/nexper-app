"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShop } from "@/components/ShopContext";
import { rupee } from "@/lib/format";
import { whatsappLink, billMessageText, taxBreakup } from "@/lib/messaging";
import { parseSpokenQuantity, matchItemFromSpeech } from "@/lib/voiceHelpers";
import { fetchShopItems } from "@/lib/products";
import { fetchActiveOffers, activeDiscountMap, clearancePrice } from "@/lib/clearance";
import { cacheProducts, getCachedProducts, cacheBills, getCachedBills } from "@/lib/productCache";
import { useT } from "@/lib/i18n";

// Everything New bill needs: items, the cart, totals, payment, voice, scan
// and saving. The phone and laptop screens (BillingMobile / BillingDesktop)
// both read from this and only differ in layout.
export function useBilling() {
  const t = useT();
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
  const [showHandwritten, setShowHandwritten] = useState(false);
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
    if (!item) return showToast(t("Couldn't match \"{q}\" to an item", { q: transcript }), "warn");
    const qty = parseSpokenQuantity(transcript, item.unit);
    if (qty && qty > 0) {
      addToCart(item, qty);
      showToast(t("🎙️ Added {qty}{unit} {name}", { qty, unit: item.unit, name: item.name }));
    } else {
      setPickerItem(item);
    }
  }

  function startVoiceAdd() {
    if (!voiceSupported) return showToast(t("Voice input isn't supported in this browser"), "err");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    try {
      recognition = new SR();
    } catch (e) {
      showToast(t("Couldn't start voice input on this device"), "err");
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
      showToast(t("Couldn't start listening — try tapping the mic again"), "err");
    }
  }

  function addToCart(item, qty = 1) {
    if (item.stock <= 0) return showToast(t("{name} is out of stock", { name: item.name }), "err");
    setCart((prev) => {
      const exists = prev.find((c) => c.shop_product_id === item.id);
      const wanted = (exists ? exists.qty : 0) + qty;
      if (wanted > item.stock) {
        showToast(t("Only {n} {unit} of {name} in stock", { n: item.stock, unit: item.unit, name: item.name }), "warn");
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

  // Items read from a customer's written list, already checked by the owner.
  function addMatched(lines) {
    lines.forEach(({ item, qty }) => addToCart(item, qty));
  }

  function updateQty(id, qty) {
    const line = cart.find((c) => c.shop_product_id === id);
    if (!line) return;
    if (qty > line.stock) {
      showToast(t("Only {n} {unit} in stock", { n: line.stock, unit: line.unit }), "warn");
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
    if (billType === "credit" && !cleanPhone) return showToast(t("Add a customer mobile number for udhaar bills"), "err");

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
        showToast(t("You're offline — this bill will sync automatically once you're back online"), "warn");
      } else if (billType === "credit") {
        showToast(t("Udhaar bill saved — {amt} added to {name}'s balance", { amt: rupee(total), name: customer.name || t("customer") }));
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
      showToast(t("Barcode scanner not supported in this browser — search by code or name instead"), "warn");
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
              showToast(t("Scanned: {val} — no exact match, showing search results", { val }));
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
      showToast(t("Camera access denied — allow it in browser settings"), "err");
    });
  }

  function printBill(bill) {
    setLastBill(bill);
    setTimeout(() => window.print(), 50);
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
    .slice(0, 12);
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

  return {
    t, supabase, activeShop, loading,
    query, setQuery, cart, customer, setCustomer, billType, paymentMethod,
    loyaltyDiscount, setLoyaltyDiscount, manualDiscount, setManualDiscount, lastBill, scannerActive,
    activeCategory, setActiveCategory, categories, pickerItem, setPickerItem, generating,
    showVoiceBilling, setShowVoiceBilling, showDetails, setShowDetails, billInView,
    pricedItems, cleanPhone, previousVisits, isLoyal, updateQty, total, discountAmount, clearanceSavings,
    cartGst, nextBillNo, clearCart, quickItems, cartQty, pay, choosePay, displayItems, browsing,
    generateBill, handleVoiceBillingConfirm, startBarcodeScanner, printBill, addToCart,
    showHandwritten, setShowHandwritten, addMatched,
  };
}
