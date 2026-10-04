export default function SyncStatusBadge({ pendingCount }) {
  if (!pendingCount) return null;
  return (
    <div
      className="flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1.5"
      style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0 ks-pulse" style={{ background: "var(--warn-solid)" }} />
      {pendingCount} change{pendingCount > 1 ? "s" : ""} pending sync
    </div>
  );
}
