// Pure helpers for play-area players/orders -- no React, no Supabase, so
// they're easy to unit test and safe to share between the live cart
// (BillingParts.js), the printed bill (PrintBillContent.js), the WhatsApp
// message (messaging.js) and Bills/History, so a table's tab looks the same
// grouping everywhere it's shown.

// Groups a flat list of bill/cart lines by player_name, keeping the group
// with no player_name (shared items, the table's own time charge, and any
// ordinary bill with no play-area lines at all) first and un-headered --
// so a normal bill groups into exactly one group with player_name null,
// and nothing about it looks different from before this feature existed.
// Players keep the order they first appear in.
export function groupLinesByPlayer(lines) {
  const groups = [];
  const byKey = new Map();
  for (const line of lines || []) {
    const key = line.player_name || null;
    if (!byKey.has(key)) {
      const group = { player_name: key, lines: [], subtotal: 0 };
      byKey.set(key, group);
      groups.push(group);
    }
    const group = byKey.get(key);
    group.lines.push(line);
    group.subtotal += line.qty * line.price;
  }
  groups.sort((a, b) => (a.player_name ? 1 : 0) - (b.player_name ? 1 : 0));
  return groups;
}

// True when a bill/cart has at least one line tagged to a specific player --
// the only time the UI needs to show player grouping/headers at all.
export function hasPlayerLines(lines) {
  return (lines || []).some((l) => l.player_name);
}
