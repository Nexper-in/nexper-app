"use client";

import NewCreditModal from "@/components/NewCreditModal";
import RecordPaymentModal from "@/components/RecordPaymentModal";
import CustomerLedgerModal from "@/components/CustomerLedgerModal";

// Pop-ups shared by the phone and laptop views.
export default function CreditModals({ vm }) {
  const { activeShop, activeShopId, supabase, credits, showNew, setShowNew, payFor, setPayFor, ledgerCustomer, setLedgerCustomer, addEntry } = vm;
  return (
    <>
      {showNew && <NewCreditModal onClose={() => setShowNew(false)} onAdd={(e) => addEntry({ ...e, type: "charge" })} />}
      {payFor && (
        <RecordPaymentModal
          customer={payFor}
          upiId={activeShop?.upi_id}
          storeName={activeShop?.name}
          onClose={() => setPayFor(null)}
          onAdd={(amount) => addEntry({ phone: payFor.phone, name: payFor.name, amount, type: "payment", note: "Payment received" })}
        />
      )}
      {ledgerCustomer && (
        <CustomerLedgerModal
          customer={ledgerCustomer}
          credits={credits}
          supabase={supabase}
          activeShopId={activeShopId}
          onClose={() => setLedgerCustomer(null)}
          onRecordPayment={(c) => setPayFor(c)}
        />
      )}
    </>
  );
}
