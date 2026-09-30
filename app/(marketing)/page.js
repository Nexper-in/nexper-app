import Link from "next/link";
import {
  Receipt,
  Package,
  Wallet,
  QrCode,
  FileBarChart2,
  WifiOff,
  Users,
  Calculator,
  Check,
  ChevronDown,
  Store,
  ShoppingCart,
  Car,
  Shirt,
  Sparkles,
  ArrowRight,
  Smartphone,
  ShieldCheck,
} from "lucide-react";
import PhoneMock from "@/components/marketing/PhoneMock";
import { PRO_PRICING, PRO_FEATURES, FREE_FEATURES, GATING_ENABLED } from "@/lib/pricing";
import { SITE } from "@/lib/site";

export const metadata = {
  title: { absolute: `${SITE.name} — ${SITE.tagline}` },
  description: SITE.description,
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    icon: Receipt,
    title: "Bill in seconds",
    text: "Search an item, scan its barcode or just say it out loud. Take cash, UPI or put it on udhaar, then print or WhatsApp the bill.",
  },
  {
    icon: Package,
    title: "Stock that warns you",
    text: "See what is running low, what expires soon and what to sell first. Run a clearance offer before stock goes to waste.",
  },
  {
    icon: Wallet,
    title: "Udhaar book",
    text: "Know who owes you what. Record payments and send a WhatsApp reminder with one tap.",
  },
  {
    icon: QrCode,
    title: "UPI QR at checkout",
    text: "Show your own UPI QR with the exact amount so customers pay straight to you.",
  },
  {
    icon: FileBarChart2,
    title: "GST reports",
    text: "Rate-wise GST summary every month, plus a GSTR-1 file ready for the GST Offline Tool.",
  },
  {
    icon: WifiOff,
    title: "Keeps working offline",
    text: "If the internet drops, bills and stock changes are saved on the phone and sync when you are back online.",
  },
  {
    icon: Users,
    title: "Staff with limits",
    text: "Give each helper their own login and PIN, and choose exactly which screens they can open.",
  },
  {
    icon: Calculator,
    title: "Day close and cashbook",
    text: "Match the cash in the drawer against the day's sales, and keep expenses and supplier dues in one place.",
  },
];

const STEPS = [
  { n: "1", title: "Create your shop", text: "Sign up, pick your kind of shop and name it. Start with a sample catalogue or an empty shelf." },
  { n: "2", title: "Add your stock", text: "Import a sheet, pick from the Indian product catalogue, or add items one by one with price and stock." },
  { n: "3", title: "Start billing", text: "Open New Bill on your phone and sell. Stock, profit and udhaar update on their own." },
];

const SHOP_TYPES = [
  { icon: Store, label: "Kirana & grocery" },
  { icon: ShoppingCart, label: "Supermarkets" },
  { icon: Car, label: "Auto parts" },
  { icon: Shirt, label: "Clothing & boutiques" },
  { icon: Smartphone, label: "Any other shop" },
];

const FAQS = [
  {
    q: "Do I need any special hardware?",
    a: "No. Nexper runs in the browser on any phone, tablet or computer. You can scan barcodes with the phone camera, and print bills if you already have a printer.",
  },
  {
    q: "What happens when the internet goes down?",
    a: "New bills and stock changes are saved on your device and sent automatically when you are back online. Other screens, like reports, need a connection.",
  },
  {
    q: "Is it really free?",
    a: "Yes. Billing, inventory, udhaar, day close, expenses, cashbook and the GST summary are free, with the owner plus one staff login. Pro adds extras for bigger shops.",
  },
  {
    q: "Can my staff use it?",
    a: "Yes. Each staff member gets a code and PIN, and you decide which screens they can see. Their permissions are enforced on the server, not just hidden in the app.",
  },
  {
    q: "Is it GST ready?",
    a: "You get a rate-wise GST summary for any month and a GSTR-1 JSON export for the GST Offline Tool. It is a helper, not a filing service, so please check your returns with your accountant.",
  },
  {
    q: "Is my shop's data safe?",
    a: "Each shop's data is kept separate and protected by access rules in the database. Only people you add can see it. Read the Privacy policy for details.",
  },
];

function SectionHeading({ eyebrow, title, text }) {
  return (
    <div className="max-w-2xl mx-auto text-center mb-10">
      <p className="ks-eyebrow mb-2" style={{ color: "var(--accent)" }}>
        {eyebrow}
      </p>
      <h2 className="ks-display text-2xl sm:text-3xl font-bold">{title}</h2>
      {text && (
        <p className="mt-3 text-sm sm:text-base" style={{ color: "var(--text-secondary)" }}>
          {text}
        </p>
      )}
    </div>
  );
}

function Plan({ name, price, per, note, features, featured, cta }) {
  return (
    <div className="ks-card p-6 flex flex-col" style={featured ? { border: "1.5px solid var(--gold)" } : undefined}>
      <p className="font-bold">{name}</p>
      <p className="ks-display text-3xl font-bold mt-2">
        {price}
        {per && (
          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {per}
          </span>
        )}
      </p>
      <p className="text-xs mt-1 min-h-[1rem]" style={{ color: "var(--text-secondary)" }}>
        {note}
      </p>
      <ul className="space-y-2.5 my-5 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check size={16} className="shrink-0 mt-0.5" style={{ color: featured ? "var(--gold)" : "#1F8A5F" }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {cta}
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="ks-hero" style={{ borderRadius: 0 }}>
        <div className="max-w-6xl mx-auto px-4 py-14 sm:py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="ks-eyebrow mb-4" style={{ color: "#E8C468" }}>
              For kirana, supermarket, auto-parts and clothing shops
            </p>
            <h1 className="ks-display text-4xl sm:text-5xl font-extrabold leading-[1.1]">
              Run your whole shop <br className="hidden sm:block" />
              from your phone.
            </h1>
            <p className="mt-5 text-base sm:text-lg max-w-xl" style={{ color: "rgba(255,255,255,0.78)" }}>
              Billing, stock and udhaar in one simple app. No training, no hardware, and it keeps working when the internet doesn&apos;t.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-bold"
                style={{ background: "#fff", color: "#3B1F87" }}
              >
                Start free <ArrowRight size={18} />
              </Link>
              <Link href="/#features" className="ks-hero-btn inline-flex items-center justify-center px-6 py-3.5 text-base">
                See what&apos;s inside
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
              {["Free to start", "Works on any phone", "Keeps billing offline"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={15} style={{ color: "#E8C468" }} /> {t}
                </li>
              ))}
            </ul>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* Shop types */}
      <section className="max-w-6xl mx-auto px-4 pt-12">
        <p className="text-center text-sm font-semibold mb-5" style={{ color: "var(--text-secondary)" }}>
          Set up for the way your kind of shop works
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {SHOP_TYPES.map(({ icon: Icon, label }) => (
            <span key={label} className="ks-card inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
              <Icon size={16} style={{ color: "var(--accent)" }} /> {label}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 pt-20 scroll-mt-20">
        <SectionHeading
          eyebrow="Features"
          title="Everything the counter needs, nothing it doesn't"
          text="Built from how shopkeepers actually work: fast at the till, clear at day end."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="ks-card p-5">
              <span className="ks-tint-icon mb-3">
                <Icon size={17} />
              </span>
              <h3 className="font-bold text-[15px]">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-6xl mx-auto px-4 pt-20 scroll-mt-20">
        <SectionHeading eyebrow="How it works" title="Your first bill in a few minutes" />
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <div key={s.n} className="ks-card p-6">
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold ks-mono"
                style={{ background: "var(--accent-soft-bg)", color: "var(--accent)" }}
              >
                {s.n}
              </span>
              <h3 className="font-bold mt-4">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {s.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-4xl mx-auto px-4 pt-20 scroll-mt-20">
        <SectionHeading
          eyebrow="Pricing"
          title="Free for the counter. Pro when you grow."
          text="No setup fee, no contract, no card needed to start."
        />
        {!GATING_ENABLED && (
          <div
            className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 mb-6 text-sm font-semibold text-center"
            style={{ background: "var(--gold-soft)", color: "var(--gold)" }}
          >
            <Sparkles size={16} className="shrink-0" /> Early access: every Pro feature is unlocked for free right now.
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <Plan
            name="Free"
            price="₹0"
            note="Forever, for one shop"
            features={FREE_FEATURES}
            cta={
              <Link href="/login?mode=signup" className="ks-btn-outline text-center">
                Start free
              </Link>
            }
          />
          <Plan
            featured
            name="Pro"
            price={`₹${PRO_PRICING.monthlyInr}`}
            per="/month"
            note={`or ₹${PRO_PRICING.yearlyInr}/year, about 24% less`}
            features={["Everything in Free, plus:", ...PRO_FEATURES.map((f) => f.label)]}
            cta={
              <Link href="/login?mode=signup" className="ks-btn-primary text-center">
                Start free, upgrade later
              </Link>
            }
          />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-4 pt-20 scroll-mt-20">
        <SectionHeading eyebrow="FAQ" title="Questions shopkeepers ask" />
        <div className="space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="ks-card group px-5 py-4">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold text-[15px]">
                {f.q}
                <ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" style={{ color: "var(--text-secondary)" }} />
              </summary>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="max-w-6xl mx-auto px-4 pt-20">
        <div className="ks-hero px-6 py-12 sm:py-14 text-center">
          <ShieldCheck size={26} className="mx-auto mb-4" style={{ color: "#E8C468" }} />
          <h2 className="ks-display text-2xl sm:text-3xl font-bold">Ready to try it at your counter?</h2>
          <p className="mt-3 text-sm sm:text-base max-w-lg mx-auto" style={{ color: "rgba(255,255,255,0.78)" }}>
            Create your shop in a minute. Your data stays yours.
          </p>
          <Link
            href="/login?mode=signup"
            className="inline-flex items-center justify-center gap-2 rounded-lg px-7 py-3.5 mt-7 text-base font-bold"
            style={{ background: "#fff", color: "#3B1F87" }}
          >
            Start free <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </>
  );
}
