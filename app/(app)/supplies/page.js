"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import ModuleGuard from "@/components/ModuleGuard";
import { useT } from "@/lib/i18n";
import useSupplies from "./useSupplies";
import RoundTab from "./RoundTab";
import AccountsTab from "./AccountsTab";
import { PointModal, SupplyPaymentModal, StatementModal } from "./SupplyModals";

// Supplies: for a tea shop, canteen or small hotel that supplies regular places
// (hospital departments, offices). The day's round, what each place owes, and
// statements. One layout for phone and laptop.
export default function SuppliesPage() {
  return (
    <ModuleGuard module="supplies" feature="supplies">
      <SuppliesScreen />
    </ModuleGuard>
  );
}

function SuppliesScreen() {
  const t = useT();
  const vm = useSupplies();
  const [tab, setTab] = useState("round");
  const [pointModal, setPointModal] = useState(null); // { point? }
  const [payFor, setPayFor] = useState(null);
  const [statementFor, setStatementFor] = useState(null);

  if (vm.loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading…")}
      </div>
    );
  }

  if (vm.error) {
    return (
      <div className="pt-4">
        <div className="ks-card p-5 text-sm">
          {vm.error === "setup"
            ? t("Supplies needs a database update first. Ask whoever looks after your setup to run update 030.")
            : t("Something went wrong. Try again.")}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <h1 className="ks-display font-bold text-xl mb-3">{t("Supplies")}</h1>
      <div className="flex gap-1.5 mb-4 p-1 rounded-full bg-[var(--bg-surface-alt)] max-w-sm">
        {[["round", t("Daily round")], ["accounts", t("Accounts")]].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 py-2 rounded-full text-sm font-semibold ${tab === id ? "bg-[var(--bg-surface)] shadow" : "text-[var(--text-secondary)]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "round" ? (
        <RoundTab vm={vm} onAddPoint={() => setPointModal({})} />
      ) : (
        <AccountsTab
          vm={vm}
          onAddPoint={() => setPointModal({})}
          onEditPoint={(point) => setPointModal({ point })}
          onStatement={setStatementFor}
          onPay={setPayFor}
        />
      )}

      {pointModal && (
        <PointModal
          point={pointModal.point}
          onClose={() => setPointModal(null)}
          onSave={(fields) => (pointModal.point ? vm.updatePoint(pointModal.point.id, fields) : vm.addPoint(fields.name, fields.phone))}
        />
      )}
      {payFor && <SupplyPaymentModal point={payFor} today={vm.today} onAdd={vm.addPayment} onClose={() => setPayFor(null)} />}
      {statementFor && (
        <StatementModal
          point={statementFor}
          vm={vm}
          onClose={() => setStatementFor(null)}
          onPay={(p) => {
            setStatementFor(null);
            setPayFor(p);
          }}
        />
      )}
    </div>
  );
}
