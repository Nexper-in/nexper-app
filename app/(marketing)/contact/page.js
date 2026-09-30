import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { SITE } from "@/lib/site";

export const metadata = {
  title: "Contact",
  description: "Get help with Nexper.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const whatsappHref = SITE.supportWhatsapp
    ? `https://wa.me/${SITE.supportWhatsapp}?text=${encodeURIComponent("Hi Nexper, I need help with ")}`
    : "";
  const hasChannel = Boolean(SITE.supportEmail || whatsappHref);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="ks-display text-3xl font-bold">Contact us</h1>
      <p className="mt-3 text-sm sm:text-base" style={{ color: "var(--text-secondary)" }}>
        Stuck on something, found a bug, or want to delete your account? Tell us and we will help.
      </p>

      {hasChannel ? (
        <div className="grid sm:grid-cols-2 gap-4 mt-8">
          {whatsappHref && (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="ks-card p-5 flex items-start gap-3 hover:border-[var(--accent)]">
              <span className="ks-tint-icon" style={{ "--tint-bg": "rgba(37,211,102,0.14)", "--tint-fg": "#1FA855" }}>
                <MessageCircle size={17} />
              </span>
              <div>
                <p className="font-bold text-sm">WhatsApp</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Fastest way to reach us
                </p>
              </div>
            </a>
          )}
          {SITE.supportEmail && (
            <a href={`mailto:${SITE.supportEmail}`} className="ks-card p-5 flex items-start gap-3 hover:border-[var(--accent)]">
              <span className="ks-tint-icon">
                <Mail size={17} />
              </span>
              <div>
                <p className="font-bold text-sm">Email</p>
                <p className="text-xs mt-0.5 break-all" style={{ color: "var(--text-secondary)" }}>
                  {SITE.supportEmail}
                </p>
              </div>
            </a>
          )}
        </div>
      ) : (
        <div className="ks-card p-5 mt-8 text-sm" style={{ color: "var(--text-secondary)" }}>
          Our support channels are being set up. Please check back soon.
        </div>
      )}

      <p className="text-xs mt-8" style={{ color: "var(--text-secondary)" }}>
        See also our{" "}
        <Link href="/privacy" className="underline">
          Privacy policy
        </Link>{" "}
        and{" "}
        <Link href="/terms" className="underline">
          Terms of use
        </Link>
        .
      </p>
    </div>
  );
}
