"use client";

import { MessageCircle, BellRing } from "lucide-react";
import { rupee } from "@/lib/format";
import { useT } from "@/lib/i18n";

// Today's udhaar reminders, ready to send. Shown only when the owner turned
// reminders on in Store settings and somebody is due. One tap opens WhatsApp
// with the message written; the customer then drops off the list until the
// next reminder is due.
export default function RemindersDue({ vm }) {
  const t = useT();
  const { due, remind } = vm;
  if (!due || due.length === 0) return null;
  return (
    <div className="ks-card p-4 mb-3" style={{ borderColor: "var(--udhaar)" }}>
      <div className="flex items-center gap-2 mb-2.5">
        <BellRing size={16} style={{ color: "var(--udhaar)" }} />
        <h2 className="ks-display font-bold text-sm">
          {due.length === 1 ? t("1 customer is due a reminder") : t("{n} customers are due a reminder", { n: due.length })}
        </h2>
      </div>
      <div className="space-y-2">
        {due.map((c) => (
          <div key={c.phone} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "var(--bg-surface-alt)" }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{c.name}</div>
              <div className="text-xs text-[var(--text-secondary)] ks-mono">
                {rupee(c.balance)}
                {c.daysOwing != null && c.daysOwing > 0 ? ` · ${t("{n} days", { n: c.daysOwing })}` : ""}
              </div>
            </div>
            <button
              onClick={() => remind(c)}
              className="text-xs px-3 py-2 rounded-full font-semibold flex items-center gap-1 text-white shrink-0"
              style={{ background: "#25D366" }}
            >
              <MessageCircle size={13} /> {t("Remind")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
