// A thin label on the practice copy (staging) so nobody mistakes it for the real app.
// Shown only when NEXT_PUBLIC_NEXPER_ENV=staging. Internal, so it stays English.
export default function EnvRibbon() {
  if (process.env.NEXT_PUBLIC_NEXPER_ENV !== "staging") return null;
  return (
    <div
      className="fixed bottom-2 left-2 z-[60] pointer-events-none text-[10px] font-bold tracking-widest px-2 py-1 rounded-full"
      style={{ background: "var(--warn-soft)", color: "var(--warn)", border: "1px solid var(--warn)" }}
    >
      STAGING
    </div>
  );
}
