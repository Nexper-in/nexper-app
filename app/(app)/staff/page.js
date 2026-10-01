"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useShop } from "@/components/ShopContext";
import AddStaffModal from "@/components/AddStaffModal";
import EditStaffModal from "@/components/EditStaffModal";
import StaffCreatedModal from "@/components/StaffCreatedModal";
import Modal from "@/components/ui/Modal";
import UpgradePrompt from "@/components/UpgradePrompt";
import { MODULES } from "@/lib/modules";
import { isPro } from "@/lib/pricing";

const FREE_STAFF_LIMIT = 1;

export default function StaffPage() {
  const { supabase, activeShopId, activeShop, currentMember, isOwner, callStaffApi, showToast } = useShop();
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showStaffUpgrade, setShowStaffUpgrade] = useState(false);
  const [editing, setEditing] = useState(null);
  const [created, setCreated] = useState(null); // { name, staffCode, pin }
  const [removing, setRemoving] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  useEffect(() => {
    // Wait for currentMember to actually resolve before deciding — on a
    // fresh page load it starts null, and isOwner is falsy until then,
    // which would otherwise bounce the real owner away too.
    if (currentMember && !isOwner) router.replace("/dashboard");
  }, [currentMember, isOwner, router]);

  const load = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    const { data } = await supabase.from("shop_members").select("*").eq("shop_id", activeShopId).order("created_at");
    setMembers(data || []);
    setLoading(false);
  }, [supabase, activeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd({ name, pin, permissions }) {
    const { staffCode } = await callStaffApi("/api/staff/create", { shopId: activeShopId, name, pin, permissions });
    setShowAdd(false);
    setCreated({ name, staffCode, pin });
    load();
  }

  async function handleSave({ name, permissions, newPin }) {
    await callStaffApi("/api/staff/update", { memberId: editing.id, name, permissions, newPin });
    setEditing(null);
    showToast("Staff member updated");
    load();
  }

  async function confirmRemove() {
    setRemoveLoading(true);
    try {
      await callStaffApi("/api/staff/delete", { memberId: removing.id });
      showToast(`${removing.name} removed`);
      setRemoving(null);
      load();
    } finally {
      setRemoveLoading(false);
    }
  }

  if (!currentMember || !isOwner) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="pt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading staff…
      </div>
    );
  }

  const staff = members.filter((m) => m.role === "staff");
  const owner = members.find((m) => m.role === "owner");

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="text-sm text-[var(--text-secondary)] max-w-md">
          Workers sign in with a staff code and PIN — from the login screen&apos;s &quot;Staff sign in&quot; tab — and only see
          the sections you allow.
        </p>
        <button
          onClick={() => (!isPro(activeShop) && staff.length >= FREE_STAFF_LIMIT ? setShowStaffUpgrade(true) : setShowAdd(true))}
          className="ks-btn-primary flex items-center gap-1.5 shrink-0"
        >
          <Plus size={16} /> Add staff member
        </button>
      </div>

      <div className="space-y-3">
        {owner && (
          <div className="ks-card p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white" style={{ background: "var(--accent)" }}>
              {owner.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{owner.name}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Full access to everything</p>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}>
              OWNER
            </span>
          </div>
        )}

        {staff.map((m) => {
          const allowed = MODULES.filter((mod) => m.permissions?.[mod.key]);
          const initials = m.name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
          return (
            <div key={m.id} className="ks-card p-4">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white" style={{ background: "#6B7280" }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-bold text-sm">{m.name}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}>
                      STAFF
                    </span>
                    <span className="ks-mono text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: "var(--bg-surface-alt)", color: "var(--text-primary)" }}>
                      Code: {m.staff_code}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {allowed.length === 0 ? (
                      <span className="text-xs text-[var(--text-secondary)]">No access granted yet</span>
                    ) : (
                      allowed.map((mod) => (
                        <span key={mod.key} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-soft-text)" }}>
                          {mod.label}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setEditing(m)}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "var(--bg-surface-alt)", color: "var(--text-primary)" }}
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setRemoving(m)}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {staff.length === 0 && (
          <div className="ks-card p-10 text-center text-[var(--text-secondary)] text-sm">
            No staff added yet — tap &quot;Add staff member&quot; to get started.
          </div>
        )}
      </div>

      {showAdd && <AddStaffModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
      {showStaffUpgrade && (
        <Modal title="Add staff member" onClose={() => setShowStaffUpgrade(false)}>
          <UpgradePrompt
            feature="More than 1 staff login"
            description="The free plan includes you plus 1 staff member. Upgrade to add more."
          />
        </Modal>
      )}
      {editing && <EditStaffModal member={editing} onClose={() => setEditing(null)} onSave={handleSave} />}
      {created && (
        <StaffCreatedModal name={created.name} staffCode={created.staffCode} pin={created.pin} onClose={() => setCreated(null)} />
      )}
      {removing && (
        <Modal title={`Remove ${removing.name}?`} onClose={() => setRemoving(null)}>
          <div className="space-y-3.5">
            <p className="text-sm text-[var(--text-secondary)]">
              They&apos;ll immediately lose access — their staff code and PIN stop working. This can&apos;t be undone; you&apos;d need
              to add them again with a new code.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setRemoving(null)} className="ks-btn-outline flex-1">
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                disabled={removeLoading}
                className="flex-1 rounded-full text-white text-sm font-semibold py-2.5 disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "var(--danger-solid)" }}
              >
                {removeLoading && <Loader2 size={16} className="animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
