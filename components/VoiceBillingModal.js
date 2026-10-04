"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Mic, MicOff, Trash2, Languages, Printer, CheckCircle2 } from "lucide-react";
import { rupee } from "@/lib/format";
import { matchItemFromSpeech, parseMultiItemSpeech, parseSpokenQuantity, classifyVoiceCommand } from "@/lib/voiceHelpers";

function speak(text, lang = "en-IN") {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 1.05;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

const HINTS = [
  { en: '"2 kg sugar, 3 biscuits"', hi: '"दो किलो चीनी, तीन बिस्किट"' },
  { en: '"remove sugar"', hi: '"चीनी hatao"' },
  { en: '"total"', hi: '"kitna hua"' },
  { en: '"udhaar"', hi: '"cash"' },
  { en: '"print" or "done"', hi: '"print" या "ho gaya"' },
];

export default function VoiceBillingModal({ items, onConfirm, onClose }) {
  const [cart, setCart] = useState([]);
  const [billType, setBillType] = useState("cash");
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [feedback, setFeedback] = useState("Tap the mic and start speaking");
  const [lang, setLang] = useState("en-IN");
  const [done, setDone] = useState(false);

  const listeningRef = useRef(false);
  const recognitionRef = useRef(null);
  const cartRef = useRef(cart);
  const langRef = useRef(lang);
  const billTypeRef = useRef(billType);

  // Keep refs in sync so callbacks always see latest values
  useEffect(() => { cartRef.current = cart; }, [cart]);
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { billTypeRef.current = billType; }, [billType]);

  const subtotal = cart.reduce((s, c) => s + c.qty * c.item.price, 0);

  const giveFeedback = useCallback((text) => {
    setFeedback(text);
    speak(text, langRef.current);
  }, []);

  const handleCommand = useCallback((transcript) => {
    const { cmd, value, query } = classifyVoiceCommand(transcript);

    if (cmd === "generate") {
      listeningRef.current = false;
      setListening(false);
      recognitionRef.current?.stop();
      if (cartRef.current.length === 0) {
        giveFeedback("Cart is empty. Add some items first.");
        return;
      }
      const total = cartRef.current.reduce((s, c) => s + c.qty * c.item.price, 0);
      giveFeedback(`Bill ready. Total is ${rupee(total)}. Generating now.`);
      setDone(true);
      setTimeout(() => onConfirm(cartRef.current, billTypeRef.current), 1500);
      return;
    }

    if (cmd === "total") {
      const total = cartRef.current.reduce((s, c) => s + c.qty * c.item.price, 0);
      giveFeedback(`Total is ${rupee(total)}`);
      return;
    }

    if (cmd === "clear") {
      setCart([]);
      giveFeedback("Cart cleared. Start again.");
      return;
    }

    if (cmd === "billtype") {
      setBillType(value);
      giveFeedback(value === "credit" ? "Switched to udhaar billing" : "Switched to cash billing");
      return;
    }

    if (cmd === "remove") {
      const item = matchItemFromSpeech(items, query);
      if (item) {
        setCart((prev) => prev.filter((c) => c.item.id !== item.id));
        giveFeedback(`Removed ${item.name}`);
      } else {
        giveFeedback("Item not found in cart");
      }
      return;
    }

    // Default: try to parse as item(s)
    const parsed = parseMultiItemSpeech(transcript, items);
    if (parsed.length > 0) {
      setCart((prev) => {
        let next = [...prev];
        parsed.forEach(({ item, qty }) => {
          const existing = next.find((c) => c.item.id === item.id);
          if (existing) {
            next = next.map((c) => (c.item.id === item.id ? { ...c, qty: c.qty + qty } : c));
          } else {
            next = [...next, { item, qty }];
          }
        });
        return next;
      });
      const names = parsed.map(({ item, qty }) => `${qty} ${item.unit === "pcs" ? "" : item.unit} ${item.name}`.trim()).join(", ");
      giveFeedback(`Added ${names}`);
    } else {
      giveFeedback("Didn't catch that — try saying an item name");
    }
  }, [items, giveFeedback, onConfirm]);

  const startRecognition = useCallback(() => {
    if (!listeningRef.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = langRef.current;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setLastHeard(t);
      handleCommand(t);
    };
    r.onend = () => {
      if (listeningRef.current) setTimeout(startRecognition, 250);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" && listeningRef.current) {
        setTimeout(startRecognition, 250);
        return;
      }
      if (e.error !== "aborted") {
        listeningRef.current = false;
        setListening(false);
        setFeedback("Microphone error — tap mic to retry");
      }
    };
    recognitionRef.current = r;
    r.start();
  }, [handleCommand]);

  function toggleListening() {
    if (listening) {
      listeningRef.current = false;
      setListening(false);
      recognitionRef.current?.stop();
      setFeedback("Paused — tap mic to resume");
    } else {
      if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
        setFeedback("Voice input not supported in this browser");
        return;
      }
      listeningRef.current = true;
      setListening(true);
      setFeedback("Listening…");
      startRecognition();
    }
  }

  function switchLang(l) {
    setLang(l);
    langRef.current = l;
    recognitionRef.current?.stop(); // restart with new lang
  }

  function removeItem(id) {
    setCart((prev) => prev.filter((c) => c.item.id !== id));
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      listeningRef.current = false;
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        className="flex flex-col w-full h-full sm:relative sm:m-auto sm:rounded-3xl sm:max-w-lg sm:max-h-[90dvh] overflow-hidden"
        style={{ background: "var(--bg-surface)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div>
            <h2 className="ks-display font-bold">Voice billing</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {billType === "credit" ? "🟣 Udhaar bill" : "💵 Cash bill"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[var(--bg-surface-alt)] rounded-full p-1">
              <button
                onClick={() => switchLang("en-IN")}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${lang === "en-IN" ? "bg-[var(--bg-surface)] shadow-sm text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
              >
                EN
              </button>
              <button
                onClick={() => switchLang("hi-IN")}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${lang === "hi-IN" ? "bg-[var(--bg-surface)] shadow-sm text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
              >
                हि
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full"
              style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Mic + feedback */}
        <div className="flex flex-col items-center py-6 shrink-0">
          {done ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 size={56} style={{ color: "var(--accent-soft-text)" }} />
              <p className="font-bold text-[var(--accent-soft-text)]">Generating bill…</p>
            </div>
          ) : (
            <>
              <button
                onClick={toggleListening}
                className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
                style={{ background: listening ? "var(--danger-solid)" : "var(--accent)" }}
              >
                {listening && (
                  <span
                    className="absolute inset-0 rounded-full animate-ping opacity-40"
                    style={{ background: "var(--danger-solid)" }}
                  />
                )}
                {listening ? (
                  <Mic size={32} className="text-white relative z-10" />
                ) : (
                  <MicOff size={32} className="text-white relative z-10" />
                )}
              </button>
              <p className="mt-3 text-sm font-semibold text-center px-6" style={{ color: "var(--text-secondary)" }}>
                {feedback}
              </p>
              {lastHeard && (
                <p className="text-xs text-[var(--text-secondary)] mt-1 italic px-6 text-center">
                  Heard: &quot;{lastHeard}&quot;
                </p>
              )}
            </>
          )}
        </div>

        {/* Cart */}
        <div className="flex-1 overflow-y-auto ks-scroll px-5 pb-2">
          {cart.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-[var(--text-secondary)] mb-4">Cart is empty — tap the mic and say item names</p>
              <div className="space-y-1.5">
                {HINTS.map((h, i) => (
                  <p key={i} className="text-xs text-[var(--text-secondary)] ks-mono">
                    {lang === "hi-IN" ? h.hi : h.en}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map(({ item, qty }) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl"
                  style={{ background: "var(--bg-surface-alt)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{item.name}</p>
                    <p className="text-xs text-[var(--text-secondary)] ks-mono">
                      {qty} {item.unit} × {rupee(item.price)}
                    </p>
                  </div>
                  <span className="ks-mono font-bold text-sm shrink-0">{rupee(qty * item.price)}</span>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="w-6 h-6 flex items-center justify-center rounded-full shrink-0"
                    style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total + action */}
        {cart.length > 0 && !done && (
          <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="ks-display font-bold text-lg">Total</span>
              <span className="ks-mono text-2xl font-bold" style={{ color: "var(--accent-soft-text)" }}>
                {rupee(subtotal)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setBillType((t) => (t === "cash" ? "credit" : "cash"))}
                className="ks-btn-outline flex-1 text-sm py-2"
              >
                {billType === "cash" ? "Switch to udhaar" : "Switch to cash"}
              </button>
              <button
                onClick={() => handleCommand("print")}
                className="ks-btn-primary flex-1 flex items-center justify-center gap-1.5"
              >
                <Printer size={15} /> Generate &amp; print
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
