"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Link2, MessageCircle, Loader2, PackagePlus, HandCoins, Undo2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import AddSupplierModal from "@/components/AddSupplierModal";
import LinkSupplierModal from "@/components/LinkSupplierModal";
import SupplierAmountModal from "@/components/SupplierAmountModal";
import { whatsappLink } from "@/lib/messaging";
import { rupee } from "@/lib/format";
import ModuleGuard from "@/components/ModuleGuard";

import { useT } from "@/lib/i18n";
export default function SuppliersPage() {
  return (
    <ModuleGuard module="suppliers" proOnly proLabel="Suppliers">
      <SuppliersPageInner />
    </ModuleGuard>
  );
}

function SuppliersPageInner() {
  const t = useT();
  const { supabase, activeShopId, showToast } = useShop();
  const [allSuppliers, setAllSuppliers] = useState([]); // every supplier this owner has, any shop
  const [links, setLinks] = useState([]); // shop_suppliers rows for the active shop: { supplier_id, owed }
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [amountModal, setAmountModal] = useState(null); // { mode: 'purchase'|'payment'|'debit', supplier }

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [{ data: suppliersData }, { data: linksData }, { data: movesData }] = await Promise.all([
      supabase.from("suppliers").select("*").eq("owner_id", user.id).order("created_at"),
      supabase.from("shop_suppliers").select("supplier_id, owed").eq("shop_id", activeShopId),
      supabase.from("movements").select("type, supplier").eq("shop_id", activeShopId),
    ]);
    setAllSuppliers(suppliersData || []);
    setLinks(linksData || []);
    setMovements(movesData || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const linkedIds = useMemo(() => new Set(links.map((l) => l.supplier_id)), [links]);
  const owedById = useMemo(() => new Map(links.map((l) => [l.supplier_id, Number(l.owed)])), [links]);
  const suppliers = useMemo(() => allSuppliers.filter((s) => linkedIds.has(s.id)), [allSuppliers, linkedIds]);
  const linkableSuppliers = useMemo(() => allSuppliers.filter((s) => !linkedIds.has(s.id)), [allSuppliers, linkedIds]);
  const totalOwed = useMemo(() => suppliers.reduce((s, sup) => s + (owedById.get(sup.id) || 0), 0), [suppliers, owedById]);

  const purchaseCount = (name) => movements.filter((m) => m.type === "in" && m.supplier === name).length;

  async function addSupplier(entry) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: supplier, error } = await supabase
      .from("suppliers")
      .insert({ ...entry, owner_id: user.id })
      .select()
      .single();
    if (error) throw error;

    const { error: linkError } = await supabase.from("shop_suppliers").insert({ shop_id: activeShopId, supplier_id: supplier.id });
    if (linkError) throw linkError;

    setAllSuppliers((prev) => [...prev, supplier]);
    setLinks((prev) => [...prev, { supplier_id: supplier.id, owed: 0 }]);
    setShowAdd(false);
    showToast(t("Supplier added"));
  }

  async function linkSupplier(supplier) {
    const { error } = await supabase.from("shop_suppliers").insert({ shop_id: activeShopId, supplier_id: supplier.id });
    if (error) throw error;
    setLinks((prev) => [...prev, { supplier_id: supplier.id, owed: 0 }]);
    showToast(t("{name} linked to this shop", { name: supplier.name }));
  }

  // Purchase: goods received on credit — owed goes up, no cash movement.
  // Payment: owed goes down, and it's a real cash-out (logged as an
  // expense so it shows in Cashbook automatically, same as rent/salary).
  // Debit note: owed goes down (return/rejected stock), no cash movement.
  async function applyAmount(supplier, mode, amount) {
    const current = owedById.get(supplier.id) || 0;
    const nextOwed = mode === "purchase" ? current + amount : Math.max(0, current - amount);

    const { error: updateError } = await supabase
      .from("shop_suppliers")
      .update({ owed: nextOwed })
      .eq("shop_id", activeShopId)
      .eq("supplier_id", supplier.id);
    if (updateError) throw updateError;

    if (mode === "payment") {
      const { error: expenseError } = await supabase.from("expenses").insert({
        shop_id: activeShopId,
        category: "Supplier payment",
        amount,
        note: supplier.name,
      });
      if (expenseError) throw expenseError;
    }

    setLinks((prev) => prev.map((l) => (l.supplier_id === supplier.id ? { ...l, owed: nextOwed } : l)));
    setAmountModal(null);
    showToast(
      mode === "purchase"
        ? t("{amt} purchase logged for {name}", { amt: rupee(amount), name: supplier.name })
        : mode === "payment"
        ? t("{amt} paid to {name}", { amt: rupee(amount), name: supplier.name })
        : t("{amt} debit note logged against {name}", { amt: rupee(amount), name: supplier.name })
    );
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("Loading suppliers…")}
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="ks-card p-4">
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">{t("Total payable")}</div>
          <div className="ks-display text-2xl font-bold mt-0.5" style={{ color: "var(--danger)" }}>
            {rupee(totalOwed)}
          </div>
        </div>
        <div className="flex gap-2">
          {linkableSuppliers.length > 0 && (
            <button onClick={() => setShowLink(true)} className="ks-btn-outline flex items-center gap-1.5">
              <Link2 size={15} /> {t("Link existing")}
            </button>
          )}
          <button onClick={() => setShowAdd(true)} className="ks-btn-primary flex items-center gap-1.5">
            <Plus size={16} /> {t("Add supplier")}
          </button>
        </div>
      </div>

      <div className="ks-card overflow-hidden overflow-x-auto">
        <table className="ks-stack w-full text-sm">
          <thead>
            <tr className="text-left ks-mono text-[11px] uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium">{t("Supplier")}</th>
              <th className="px-5 py-3 font-medium">{t("Phone")}</th>
              <th className="px-5 py-3 font-medium">{t("Supplies")}</th>
              <th className="px-5 py-3 font-medium">{t("Owed")}</th>
              <th className="px-5 py-3 font-medium">{t("Purchases logged")}</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => {
              const owed = owedById.get(s.id) || 0;
              return (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-alt)]">
                  <td className="px-5 py-3 font-semibold">{s.name}</td>
                  <td className="px-5 py-3 ks-mono text-[var(--text-secondary)]">{s.phone || "—"}</td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">{s.items || "—"}</td>
                  <td className="px-5 py-3 ks-mono font-bold" style={{ color: owed > 0 ? "var(--danger)" : "var(--text-secondary)" }}>
                    {rupee(owed)}
                  </td>
                  <td className="px-5 py-3 ks-mono">{purchaseCount(s.name)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setAmountModal({ mode: "purchase", supplier: s })}
                        title={t("Log purchase (increases owed)")}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}
                      >
                        <PackagePlus size={13} />
                      </button>
                      <button
                        onClick={() => setAmountModal({ mode: "payment", supplier: s })}
                        title={t("Record payment")}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: "var(--success-soft)", color: "var(--success)" }}
                      >
                        <HandCoins size={13} />
                      </button>
                      <button
                        onClick={() => setAmountModal({ mode: "debit", supplier: s })}
                        title={t("Log return / debit note")}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                      >
                        <Undo2 size={13} />
                      </button>
                      {s.phone && (
                        <button
                          onClick={() => window.open(whatsappLink(s.phone, `Hi ${s.name}, `), "_blank")}
                          className="text-xs px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1 text-white"
                          style={{ background: "#25D366" }}
                        >
                          <MessageCircle size={13} /> {t("Message")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[var(--text-secondary)] text-sm">
                  {t("No suppliers linked to this shop yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && <AddSupplierModal onClose={() => setShowAdd(false)} onAdd={addSupplier} />}
      {showLink && <LinkSupplierModal availableSuppliers={linkableSuppliers} onClose={() => setShowLink(false)} onLink={linkSupplier} />}
      {amountModal && (
        <SupplierAmountModal
          mode={amountModal.mode}
          supplier={amountModal.supplier}
          onClose={() => setAmountModal(null)}
          onConfirm={(amount) => applyAmount(amountModal.supplier, amountModal.mode, amount)}
        />
      )}
    </div>
  );
}
