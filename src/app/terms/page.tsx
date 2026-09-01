import type { Metadata } from "next";

// v0.22 — public Terms page for the Dwellsy IQ Markets product. The operative
// agreement is the customer's signed order form / master agreement; where
// none exists, Dwellsy's company-wide Terms of Use
// (dwellsy.com/pages/terms-of-use) govern. This page restates the key
// positions of the corporate Terms (entity, governing law, arbitration,
// liability, IP, prohibited uses) in product-specific, plain language. It is
// aligned to the corporate Terms but should still get a counsel pass before
// being relied on for the IQ product specifically.

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms that govern use of the Dwellsy IQ Markets product.",
};

const LAST_UPDATED = "June 29, 2026";
const CORPORATE_TERMS = "https://dwellsy.com/pages/terms-of-use";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-[18px] font-semibold tracking-tight text-navy">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed text-foreground/80">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-14">
      <header className="border-b border-grid pb-6">
        <p className="dq-eyebrow text-teal">Terms of Use</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-navy">
          Dwellsy IQ Markets Terms of Use
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
          Dwellsy IQ Markets is operated by Dwellsy, Inc. These terms govern access to
          and use of the product. Where your organization has a signed order
          form or master agreement with Dwellsy, that agreement controls; these
          terms and Dwellsy&rsquo;s company-wide{" "}
          <a
            href={CORPORATE_TERMS}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-teal hover:text-teal-700"
          >
            Terms of Use
          </a>{" "}
          supplement it.
        </p>
        <p className="mt-2 text-[12.5px] text-muted-2">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <Section title="1. License &amp; access">
        <p>
          Subject to these terms and your agreement, Dwellsy grants your
          organization a limited, non-exclusive, non-transferable right to
          access Dwellsy IQ Markets for its internal business purposes. Access is
          provisioned by Dwellsy and scoped to the markets your organization has
          licensed. Credentials are for your organization&rsquo;s authorized
          members and may not be shared outside it.
        </p>
      </Section>

      <Section title="2. Restrictions / acceptable use">
        <p>You may not:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Access markets or data your organization has not licensed, or
            attempt to circumvent access controls.
          </li>
          <li>
            Use the Service for competitive access or benchmarking, or to build
            a competing dataset or product.
          </li>
          <li>
            Scrape, screen-scrape, bulk-export, or use automated means to
            extract data without a written agreement permitting it.
          </li>
          <li>
            Copy, modify, or create derivative works from the Service, or
            reverse-engineer the methodology or software.
          </li>
          <li>
            Probe, scan, or test the vulnerability of the Service, or disrupt it
            for other users.
          </li>
        </ul>
      </Section>

      <Section title="3. Intellectual property">
        <p>
          All right, title, and interest in the Service — including the
          software, scorecards, rankings, methodology, and underlying data —
          belong solely and exclusively to Dwellsy, Inc. or its licensors. No
          rights are granted except the limited access right above.
        </p>
      </Section>

      <Section title="4. Data &amp; confidentiality">
        <p>
          Our handling of data in the product is described in the{" "}
          <a href="/privacy" className="font-semibold text-teal hover:text-teal-700">
            Privacy
          </a>{" "}
          page. The scorecards, rankings, and analyses are confidential, marked
          for institutional use only, and provided for your organization&rsquo;s
          internal use.
        </p>
      </Section>

      <Section title="5. No investment advice">
        <p>
          Dwellsy IQ Markets provides data and analytics, not investment, legal, or
          financial advice. Outputs are estimates derived from observed market
          signals and a stated methodology and may contain errors or omissions.
          You are responsible for your own diligence and decisions.
        </p>
      </Section>

      <Section title="6. Disclaimer of warranties">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;with all
          faults.&rdquo; To the maximum extent permitted by law, Dwellsy
          disclaims all warranties — express or implied — including as to
          accuracy, completeness, security, and uninterrupted availability,
          except as expressly stated in a signed agreement.
        </p>
      </Section>

      <Section title="7. Limitation of liability">
        <p>
          To the maximum extent permitted by law, Dwellsy will not be liable for
          any indirect, special, incidental, punitive, or consequential damages.
          Dwellsy&rsquo;s total cumulative liability will not exceed the amounts
          paid for the Service in the six (6) months preceding the claim. Any
          claim must be brought within one (1) year after it accrues.
        </p>
      </Section>

      <Section title="8. Term &amp; termination">
        <p>
          Access continues for the term of your agreement. Dwellsy may suspend
          or terminate access for breach of these terms or non-payment, and you
          may stop using the Service at any time. Provisions that by their
          nature should survive termination — intellectual property,
          confidentiality, disclaimers, and limitation of liability — survive.
        </p>
      </Section>

      <Section title="9. Governing law &amp; dispute resolution">
        <p>
          These terms are governed by the laws of the State of California and
          controlling U.S. federal law, with exclusive jurisdiction in the state
          and federal courts located in the State of California.
        </p>
        <p>
          The parties will first attempt to resolve any dispute informally. A
          dispute not resolved within thirty (30) days will be settled by final
          and binding arbitration under the Commercial Arbitration Rules of the
          American Arbitration Association, held in San Jose, California.
          Disputes are resolved on an individual basis only —{" "}
          <strong className="font-semibold text-navy">
            class and representative proceedings are waived
          </strong>
          . Either party may still seek injunctive relief for unauthorized use,
          infringement, or misappropriation of intellectual property.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>
          We may update these terms as the product evolves. Material changes will
          be reflected here with an updated date; continued use after an update
          constitutes acceptance.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          Questions about these terms:{" "}
          <a
            href="mailto:info@dwellsy.com?subject=Operator%20IQ%20Terms%20of%20Use%20inquiry"
            className="font-semibold text-teal hover:text-teal-700"
          >
            info@dwellsy.com
          </a>
          .
        </p>
        <p className="text-[13px] text-muted-foreground">
          Dwellsy, Inc., 171 Main St. Suite 164, Los Altos, CA 94022 — Attn:
          Contracts Compliance Officer.
        </p>
      </Section>
    </main>
  );
}
