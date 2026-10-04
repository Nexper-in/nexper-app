// Called when someone signs out. A shared counter phone must not keep the last
// person's shop data readable: this drops the offline copies of items and bills
// and anything in the browser's cache storage.
//
// Kept on purpose: theme, language, the Getting started hide flag, and
// `nexper.pendingWrites` (bills made offline that haven't synced yet: deleting
// them would lose real sales).
const KEEP = ["nexper.theme", "nexper.lang", "nexper.pendingWrites", "sabstore.pendingWrites"];

export async function clearLocalData() {
  try {
    Object.keys(localStorage)
      .filter((k) => (k.startsWith("nexper.") || k.startsWith("sabstore.")) && !KEEP.includes(k) && !k.startsWith("nexper.started."))
      .forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch {}
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {}
}
