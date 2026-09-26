// Persists shop products and recent bills to localStorage so the
// billing page can work when the device is offline. Written every time
// a successful online load completes; read as a fallback when offline.

const productKey = (shopId) => `nammalekka.products.${shopId}`;
const billKey    = (shopId) => `nammalekka.bills.${shopId}`;

export function cacheProducts(shopId, items) {
  try {
    localStorage.setItem(productKey(shopId), JSON.stringify(items));
  } catch {}
}

export function getCachedProducts(shopId) {
  try {
    const raw = localStorage.getItem(productKey(shopId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Only the most recent 200 bills are cached — enough for loyal-customer
// detection; full history still requires being online.
export function cacheBills(shopId, bills) {
  try {
    localStorage.setItem(billKey(shopId), JSON.stringify(bills.slice(0, 200)));
  } catch {}
}

export function getCachedBills(shopId) {
  try {
    const raw = localStorage.getItem(billKey(shopId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
