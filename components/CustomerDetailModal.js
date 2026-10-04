"use client";

import Modal from "@/components/ui/Modal";
import { rupee } from "@/lib/format";

export default function CustomerDetailModal({ customer, bills, onClose }) {
  const custBills = bills
    .filter((b) => (b.customer_phone || "").replace(/\D/g, "") === customer.phone)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <Modal title={customer.name} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
          <span className="text-sm text-[var(--text-secondary)]">
            {customer.phone} · {customer.visits} visit{customer.visits === 1 ? "" : "s"}
          </span>
          <span className="ks-mono text-lg font-bold text-[var(--accent-soft-text)]">{rupee(customer.total)}</span>
        </div>
        <div className="max-h-80 overflow-y-auto ks-scroll space-y-2.5 pr-1">
          {custBills.map((b) => (
            <div key={b.id} className="flex items-center justify-between text-sm">
              <div>
                <div className="font-medium ks-mono">{b.bill_no}</div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  {new Date(b.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} · {(b.items || []).length} item
                  {(b.items || []).length === 1 ? "" : "s"}
                </div>
              </div>
              <span className="ks-mono font-semibold">{rupee(b.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
