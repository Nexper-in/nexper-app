const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  // Shop data comes from Supabase. Never keep those responses in the browser's
  // cache storage: after sign-out on a shared phone they would still be readable.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      { urlPattern: ({ url }) => /\.supabase\.(co|in)$/.test(url.hostname) || url.pathname.startsWith("/api/"), handler: "NetworkOnly" },
    ],
  },
});

const isDev = process.env.NODE_ENV === "development";

// Where the app is allowed to connect: itself and the Supabase project.
let supabaseOrigin = "";
try {
  supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
} catch {}
const connect = ["'self'", "https://accounts.google.com/gsi/", supabaseOrigin, supabaseOrigin.replace("https://", "wss://")].filter(Boolean).join(" ");

// Content Security Policy. 'unsafe-inline' for scripts is needed by Next.js's
// own inline bootstrap and the theme script; everything else is locked down:
// no plugins, no framing, forms and base URL only to this site, and network
// calls only to this site and Supabase.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "frame-src https://accounts.google.com/gsi/",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src ${connect}${isDev ? " ws://localhost:*" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera and microphone are used by barcode scanning and voice billing.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
  // Google's sign-in popup needs to talk back to this page.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The marketing and legal pages live in the nexper-site repo (nexper.in).
  async redirects() {
    return [
      { source: "/", destination: "/login", permanent: false },
      { source: "/privacy", destination: "https://nexper.in/privacy/", permanent: true },
      { source: "/terms", destination: "https://nexper.in/terms/", permanent: true },
      { source: "/contact", destination: "https://nexper.in/contact/", permanent: true },
    ];
  },
};

module.exports = withPWA(nextConfig);
