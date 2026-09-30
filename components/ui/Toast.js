"use client";

import { AlertTriangle, Receipt } from "lucide-react";

export default function Toast({ msg, tone }) {
  const styles = {
    err: { bg: "#E5484D", icon: <AlertTriangle size={16} /> },
    warn: { bg: "#F2A93B", icon: <AlertTriangle size={16} /> },
    ok: { bg: "var(--accent)", icon: <Receipt size={16} /> },
  }[tone || "ok"];
  return (
    <div
      className="ks-no-print fixed bottom-24 lg:bottom-5 right-5 px-4 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold z-50 flex items-center gap-2 ks-pop"
      style={{ background: styles.bg }}
    >
      {styles.icon}
      {msg}
    </div>
  );
}
