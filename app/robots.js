import { SITE } from "@/lib/site";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/dashboard", "/billing", "/inventory", "/history", "/credit", "/dayclose", "/expenses", "/cashbook", "/suppliers", "/purchase-orders", "/reports", "/staff", "/clearance", "/upgrade", "/reset-password"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
