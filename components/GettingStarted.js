"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, X, Smartphone } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SHOP_TYPES, seedItemsForShop } from "@/lib/shopTypes";

// A short checklist on Home for a new shop: first bill, own items, UPI,
// install on the phone. Hides itself when everything is done, or when the
// owner dismisses it (remembered on this device).
export default function GettingStarted({ shop, items, bills }) {
  const t = useT();
  const router = useRouter();
  const key = `nexper.started.${shop?.id}`;
  const [hidden, setHidden] = useState(true);
  const [installEvent, setInstallEvent] = useState(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "done");
    } catch {
      setHidden(false);
    }
    setStandalone(window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [key]);

  if (!shop || hidden) return null;

  // Items that came with the starter set don't count as "your own".
  const starterNames = new Set(SHOP_TYPES.flatMap((st) => seedItemsForShop(st.id).map((i) => i.name)));
  const steps = [
    { id: "bill", done: bills.length > 0, label: t("Make your first bill"), run: () => router.push("/billing") },
    { id: "items", done: items.some((i) => !starterNames.has(i.name)), label: t("Add your own items"), run: () => router.push("/inventory?add=1") },
    { id: "upi", done: Boolean(shop.upi_id), label: t("Add your UPI ID to show a QR"), run: () => window.dispatchEvent(new Event("nexper:open-settings")) },
  ];
  if (!standalone && (installEvent || ios)) {
    steps.push({
      id: "install",
      done: false,
      label: t("Add Nexper to your home screen"),
      icon: Smartphone,
      run: async () => {
        if (installEvent) {
          installEvent.prompt();
          await installEvent.userChoice.catch(() => {});
          setInstallEvent(null);
        } else setShowIosHelp((v) => !v);
      },
    });
  }
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  function dismiss() {
    try {
      localStorage.setItem(key, "done");
    } catch {}
    setHidden(true);
  }

  return (
    <div className="ks-card p-4 mb-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="ks-display font-bold text-base">{t("Getting started")}</h2>
        <div className="flex items-center gap-2">
          <span className="ks-mono text-xs" style={{ color: "var(--text-secondary)" }}>
            {doneCount}/{steps.length}
          </span>
          <button onClick={dismiss} aria-label={t("Hide")} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--bg-surface-alt)" }}>
            <X size={13} />
          </button>
        </div>
      </div>
      <div>
        {steps.map((s) => {
          const Icon = s.done ? CheckCircle2 : s.icon || Circle;
          return (
            <button
              key={s.id}
              onClick={s.done ? undefined : s.run}
              disabled={s.done}
              className="w-full flex items-center gap-3 py-2.5 text-left text-sm font-medium"
              style={{ color: s.done ? "var(--text-secondary)" : "var(--text-primary)" }}
            >
              <Icon size={18} style={{ color: s.done ? "var(--success)" : "var(--accent-soft-text)" }} />
              <span className={s.done ? "line-through" : ""}>{s.label}</span>
            </button>
          );
        })}
      </div>
      {showIosHelp && (
        <p className="text-xs rounded-lg px-3 py-2 mt-1" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}>
          {t("In Safari tap the Share button, then Add to Home Screen.")}
        </p>
      )}
    </div>
  );
}
