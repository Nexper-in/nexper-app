import { SITE } from "@/lib/site";

export default function sitemap() {
  const lastModified = new Date();
  return ["", "/login", "/contact", "/privacy", "/terms"].map((path) => ({
    url: `${SITE.url}${path}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));
}
