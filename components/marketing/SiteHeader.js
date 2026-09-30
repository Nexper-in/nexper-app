import Link from "next/link";
import Image from "next/image";
import HeaderActions from "@/components/marketing/HeaderActions";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export default function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--bg-surface) 88%, transparent)", borderColor: "var(--border)" }}
    >
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="Nexper home">
          <Image src="/logo-mark.svg" alt="" width={32} height={32} className="rounded-lg" priority />
          <span className="ks-display font-bold text-lg">Nexper</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium hover:text-brand" style={{ color: "var(--text-secondary)" }}>
              {l.label}
            </Link>
          ))}
        </nav>

        <HeaderActions />
      </div>
    </header>
  );
}
