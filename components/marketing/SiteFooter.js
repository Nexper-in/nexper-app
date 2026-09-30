import Link from "next/link";
import Image from "next/image";
import { SITE } from "@/lib/site";

const COLS = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how", label: "How it works" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of use" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/login?mode=signup", label: "Start free" },
      { href: "/login?mode=staff", label: "Staff sign in" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t mt-16" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Image src="/logo-mark.svg" alt="" width={28} height={28} className="rounded-lg" />
            <span className="ks-display font-bold">{SITE.name}</span>
          </div>
          <p className="text-sm mt-3 max-w-xs" style={{ color: "var(--text-secondary)" }}>
            {SITE.tagline}. Made for India&apos;s small shops.
          </p>
        </div>
        {COLS.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
              {col.title}
            </p>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm hover:text-brand">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto px-4 py-4 text-xs" style={{ color: "var(--text-secondary)" }}>
          &copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
