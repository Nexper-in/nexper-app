import Link from "next/link";
import LegalPage, { LegalSection, LegalList } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Privacy policy",
  description: "What Nexper collects, why, and the choices you have.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="Nexper (nexper.in) is a billing, inventory and udhaar app for small shops. This page explains, in plain language, what information we handle and what we do with it."
    >
      <LegalSection title="What we collect">
        <LegalList
          items={[
            "Account details: your name, email address and password (passwords are stored hashed, never in plain text). Staff accounts use a staff code and PIN created by the shop owner.",
            "Shop data you enter: shop name and type, items, prices, stock, bills, expenses, suppliers and cash records.",
            "Customer details you choose to record, such as a name or phone number for a bill or an udhaar entry.",
            "Technical data: basic server logs, and browser storage (cookies and local storage) used to keep you signed in and to save bills on your device while you are offline.",
          ]}
        />
      </LegalSection>

      <LegalSection title="How we use it">
        <LegalList
          items={[
            "To run the service for you: sign-in, billing, stock, reports and staff permissions.",
            "To keep the service secure, prevent abuse and fix problems.",
            "To answer your support requests.",
          ]}
        />
        <p>We do not sell your data and we do not show advertising. We do not currently use advertising or analytics trackers.</p>
      </LegalSection>

      <LegalSection title="Your customers' information">
        <p>
          You decide which customer details to record. You are responsible for having the right to record them. We process that information only to provide Nexper to
          you, and it is visible only to the people in your shop that you allow.
        </p>
      </LegalSection>

      <LegalSection title="Who helps us run Nexper">
        <p>We use trusted service providers to operate the app. They process data on our behalf:</p>
        <LegalList
          items={[
            "Supabase, for the database and sign-in.",
            "Vercel, for hosting the website and app.",
            "An AI service (Anthropic), only when you choose to scan a supplier bill. The photo you upload is sent to read the items on it.",
          ]}
        />
        <p>We share information beyond this only if the law requires it.</p>
      </LegalSection>

      <LegalSection title="Who can see your shop's data">
        <p>
          Each shop's data is separated from other shops by access rules in the database. You and the staff you add can see it, limited by the permissions you set.
          Nexper administrators can access account and shop information when needed to operate, secure and support the service.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          The site is served over HTTPS and access is controlled on the server. No system is perfectly secure, so please use a strong password, keep staff PINs private and
          sign out on shared devices.
        </p>
      </LegalSection>

      <LegalSection title="Keeping and deleting data">
        <p>
          We keep your data while your account is active. To have your account and shop data deleted, or to correct or get a copy of it, contact us. We may keep limited
          records where the law requires.
        </p>
      </LegalSection>

      <LegalSection title="Age">
        <p>Nexper is for business use by adults. It is not meant for children under 18.</p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          If we change this policy we will update the date above. Questions or requests? See our <Link href="/contact" className="text-brand font-semibold">contact page</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
