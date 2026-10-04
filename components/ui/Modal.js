"use client";

import { X } from "lucide-react";

export default function Modal({ title, onClose, children }) {
  return (
    <div className="ks-no-print fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] px-4">
      <div
        className="ks-card rounded-3xl w-full max-w-sm shadow-2xl max-h-[85dvh] flex flex-col"
        style={{ background: "var(--bg-surface)" }}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
          <h3 className="ks-display font-bold">{title}</h3>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "var(--bg-surface-alt)" }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="p-5 overflow-y-auto ks-scroll">{children}</div>
      </div>
    </div>
  );
}
