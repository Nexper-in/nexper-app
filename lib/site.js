// Public-site constants shared by the marketing pages, SEO metadata, sitemap
// and legal pages. Support contact details come from env vars so they can be
// set per deployment (Vercel dashboard) without a code change.

export const SITE = {
  name: "Nexper",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://nexper.in",
  tagline: "Your store, in your pocket",
  description:
    "Nexper is a simple billing, inventory and udhaar (credit) app for kirana stores, supermarkets, auto-parts and clothing shops. Works on any phone, free to start.",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
  // Digits only with country code, e.g. 919876543210
  supportWhatsapp: (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").replace(/\D/g, ""),
  legalUpdated: "30 September 2026",
};
