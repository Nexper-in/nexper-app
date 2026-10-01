import { SITE } from "@/lib/site";

export default function sitemap() {
  const lastModified = new Date();
  return ["/login"].map((path) => ({
    url: `${SITE.url}${path}`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.5,
  }));
}
