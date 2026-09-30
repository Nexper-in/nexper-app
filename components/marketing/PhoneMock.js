import { Receipt, AlertTriangle, Wallet } from "lucide-react";

const LINES = [
  { name: "Aashirvaad Atta 5kg", qty: 1, amount: 245 },
  { name: "Amul Toned Milk", qty: 2, amount: 54 },
  { name: "Parle-G Biscuit", qty: 3, amount: 30 },
];

// Decorative sample bill — illustrative data only, not a real shop.
export default function PhoneMock() {
  const total = LINES.reduce((s, l) => s + l.amount, 0);
  return (
    <div className="relative mx-auto w-[260px] sm:w-[280px]" aria-hidden="true">
      <div
        className="absolute -left-28 top-14 z-10 hidden sm:flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold shadow-lg whitespace-nowrap"
        style={{ background: "#fff", color: "#1A1D29" }}
      >
        <AlertTriangle size={14} style={{ color: "#E5484D" }} /> Sugar: 3 kg left
      </div>
      <div
        className="absolute -right-28 bottom-32 z-10 hidden sm:flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold shadow-lg whitespace-nowrap"
        style={{ background: "#fff", color: "#1A1D29" }}
      >
        <Wallet size={14} style={{ color: "var(--gold)" }} /> Udhaar due ₹115
      </div>

      <div className="rounded-[2.2rem] p-2.5 shadow-2xl" style={{ background: "#0E0A1C", border: "1px solid rgba(255,255,255,0.12)" }}>
        <div className="rounded-[1.7rem] overflow-hidden" style={{ background: "var(--bg-page)", color: "var(--text-primary)" }}>
          <div className="flex items-center gap-2 px-4 pt-5 pb-3" style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
            <Receipt size={16} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-bold">New bill</span>
          </div>

          <div className="p-3 space-y-2">
            {LINES.map((l) => (
              <div key={l.name} className="ks-card px-3 py-2.5 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{l.name}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                    Qty {l.qty}
                  </p>
                </div>
                <span className="ks-mono text-xs font-semibold">₹{l.amount}</span>
              </div>
            ))}

            <div className="flex text-[10px] font-semibold rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
              {["Cash", "UPI", "Udhaar"].map((m, i) => (
                <span
                  key={m}
                  className="flex-1 text-center py-1.5"
                  style={i === 1 ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}
                >
                  {m}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between px-1 pt-1">
              <span className="text-xs font-semibold">Total</span>
              <span className="ks-display text-lg font-bold" style={{ color: "var(--accent)" }}>
                ₹{total}
              </span>
            </div>
            <div className="ks-btn-primary text-center text-xs py-2.5">Generate bill</div>
          </div>
        </div>
      </div>
    </div>
  );
}
