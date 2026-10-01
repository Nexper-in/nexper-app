// Matches a name read from a bill or a handwritten list to one of the shop's
// items. Tries, in order: exact, one name inside the other, the Hindi/local
// name, then the most shared words. Returns the item or null.
const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

export function matchItem(name, items) {
  const q = norm(name);
  if (!q || !items?.length) return null;
  const named = items.map((i) => ({ i, n: norm(i.name), h: norm(i.hindi_name) }));

  let m = named.find((x) => x.n === q || (x.h && x.h === q));
  if (m) return m.i;
  m = named.find((x) => x.n.length >= 3 && q.includes(x.n));
  if (m) return m.i;
  m = named.find((x) => q.length >= 3 && x.n.includes(q));
  if (m) return m.i;
  m = named.find((x) => x.h && x.h.length >= 2 && (q.includes(x.h) || x.h.includes(q)));
  if (m) return m.i;

  // Shared words: "toor dal 1 kg" vs "Toor Dal (Arhar)"
  const words = q.split(" ").filter((w) => w.length >= 3);
  let best = null;
  let bestScore = 0;
  for (const x of named) {
    const itemWords = new Set(x.n.split(" "));
    const score = words.filter((w) => itemWords.has(w)).length;
    if (score > bestScore) {
      best = x.i;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}
