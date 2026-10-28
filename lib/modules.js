// Every module that can be independently toggled per-shop (Store
// Settings) or per-staff-member (Staff page). `nav` is what the sidebar
// filters against; `permissionKey` is the same string used both in
// shops.enabled_modules and shop_members.permissions.
export const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "inventory", label: "Inventory" },
  { key: "billing", label: "New Bill" },
  { key: "supplies", label: "Supplies" },
  { key: "play_area", label: "Play area" },
  { key: "history", label: "History" },
  { key: "credit", label: "Udhaar" },
  { key: "dayclose", label: "Day Close" },
  { key: "expenses", label: "Expenses" },
  { key: "cashbook", label: "Cashbook" },
  { key: "suppliers", label: "Suppliers" },
  { key: "reports", label: "Reports" },
];

export function defaultPermissions(allOn) {
  return Object.fromEntries(MODULES.map((m) => [m.key, allOn]));
}

// Modules that aren't in the per-shop on/off list (Store settings) and are not
// part of the default `shops.enabled_modules`: they are always available, and
// the pages themselves limit who can open them (Purchase orders to anyone with
// the Pro/owner rules, Clearance and Offers to the owner).
const ALWAYS_ENABLED = ["purchase_orders", "clearance"];

// Play area (carrom, snooker, chess, video-game rentals by the hour) only
// makes sense for a tea shop / canteen / hotel -- a kirana, supermarket,
// automobile or clothing shop has no use for it, so it's hidden for every
// other business type, however enabled_modules is set.
export function isModuleEnabled(shop, key) {
  if (key === "play_area" && shop?.type !== "canteen") return false;
  if (ALWAYS_ENABLED.includes(key)) return true;
  return (shop?.enabled_modules || null) ? shop.enabled_modules.includes(key) : true;
}

// Shops of this type start with Supplies and Play area switched on and the
// counter-credit and supplier screens off, so a tea shop sees only what it uses.
export function defaultModulesForType(typeId) {
  if (typeId === "canteen") return ["dashboard", "supplies", "play_area", "billing", "inventory", "history", "expenses", "cashbook", "dayclose", "reports"];
  return null; // the database default
}
