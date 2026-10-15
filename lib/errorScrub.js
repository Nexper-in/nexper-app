// Keeps an error report useful but harmless: no long numbers (phone numbers, bill totals, ids),
// no emails, short.
export function scrub(text, max) {
  return String(text ?? "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
    .replace(/\d{6,}/g, "#")
    .slice(0, max);
}
