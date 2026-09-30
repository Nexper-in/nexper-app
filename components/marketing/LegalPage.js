import { SITE } from "@/lib/site";

export function LegalSection({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="ks-display text-lg font-bold mb-2">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {children}
      </div>
    </section>
  );
}

export function LegalList({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

export default function LegalPage({ title, intro, children }) {
  return (
    <article className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="ks-display text-3xl font-bold">{title}</h1>
      <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
        Last updated {SITE.legalUpdated}
      </p>
      {intro && (
        <p className="mt-5 text-sm sm:text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {intro}
        </p>
      )}
      {children}
    </article>
  );
}
