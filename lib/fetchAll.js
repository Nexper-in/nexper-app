// The database API returns at most 1000 rows per request and stops there
// without any error. Anything that must see *every* row (a stock list, a
// customer's balance) has to read it page by page; anything that only needs a
// recent window should ask for just that window (see startOfToday / daysAgo).
//
// `makeQuery` builds a fresh query each call, with its filters and a
// deterministic order that ends in a unique column (for example
// .order("date").order("id")), so pages never overlap or skip rows.
export const PAGE_SIZE = 1000;

export async function fetchAll(makeQuery, { max = 100000 } = {}) {
  const rows = [];
  for (let from = 0; rows.length < max; from += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
