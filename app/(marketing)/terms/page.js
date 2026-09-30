import Link from "next/link";
import LegalPage, { LegalSection, LegalList } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Terms of use",
  description: "The rules for using Nexper.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro="By creating an account or using Nexper (nexper.in) you agree to these terms. Please read them; they are short."
    >
      <LegalSection title="Using Nexper">
        <LegalList
          items={[
            "You must be an adult able to enter a contract, using Nexper for a lawful business.",
            "Give accurate details and keep your password and staff PINs safe. You are responsible for activity under your account and your staff's accounts.",
            "Do not misuse the service: no attempts to break, overload or reverse-engineer it, and no access to other shops' data.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Your data">
        <p>
          The shop data you enter stays yours. You allow us to store and process it to run the service, as described in our{" "}
          <Link href="/privacy" className="text-brand font-semibold">Privacy policy</Link>. You are responsible for the accuracy of your bills, stock and tax records.
        </p>
      </LegalSection>

      <LegalSection title="Plans and payment">
        <p>
          Nexper has a free plan and a paid Pro plan. Features, limits and prices are shown on our pricing section and may change. Where we offer features for free during
          early access, we may start charging for them with advance notice. Paid plans, when available, are billed through a payment partner.
        </p>
      </LegalSection>

      <LegalSection title="Reports and GST">
        <p>
          GST summaries and exports are a convenience built from the information you enter. They are not tax advice or a filing service. Please verify your returns with a
          qualified accountant.
        </p>
      </LegalSection>

      <LegalSection title="Availability">
        <p>
          We work to keep Nexper running, but it is provided as is, without a guarantee that it will always be available or error free. Keep your own records where they
          matter to you.
        </p>
      </LegalSection>

      <LegalSection title="Liability">
        <p>
          To the extent the law allows, Nexper is not liable for indirect or consequential losses, such as lost profit or business interruption, and our total liability
          for any claim is limited to the amount you paid us in the 12 months before it.
        </p>
      </LegalSection>

      <LegalSection title="Ending your use">
        <p>
          You can stop using Nexper at any time and ask us to delete your account. We may suspend or end accounts that break these terms or put the service or other users at
          risk.
        </p>
      </LegalSection>

      <LegalSection title="Changes, law and contact">
        <p>
          We may update these terms and will change the date above when we do. Continuing to use Nexper after a change means you accept it. These terms are governed by the
          laws of India. Questions? See our <Link href="/contact" className="text-brand font-semibold">contact page</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
