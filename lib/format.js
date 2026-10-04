export const rupee = (n) =>
  `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Marks text for translation (see lib/i18n.js); the caller translates it.
const T = (text) => text;

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return T("Good morning");
  if (h < 17) return T("Good afternoon");
  return T("Good evening");
}

// user.user_metadata.full_name, falling back to the email's local part
// if the owner hasn't set a name (or hasn't signed up since name
// collection was added).
export function displayName(user) {
  if (!user) return "";
  const fullName = user.user_metadata?.full_name;
  if (fullName) return fullName.split(" ")[0];
  return user.email?.split("@")[0] || "";
}

// Up to 2 letters for an avatar badge — first + last name initials, or
// just the first letter of a single name / the email if no name is set.
export function initials(user) {
  if (!user) return "";
  const fullName = user.user_metadata?.full_name?.trim();
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (user.email?.[0] || "").toUpperCase();
}
