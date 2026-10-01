const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
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
