import type { Metadata } from "next";

// v0.22 — public Terms page. This is a plain-language scaffold of standard
// B2B SaaS terms for the Dwellsy IQ product. IMPORTANT: the operative legal
// agreement with a customer is the signed order form / master agreement;
// this page is a starting draft and SHOULD be reviewed by counsel before it
// is relied on. It does not invent commercial specifics (pricing, SLAs,
// liability caps) — those belong in the signed agreement.

export const metadata: Metadata = {
  title: "Terms of Use — Dwellsy IQ",
  description: "The terms that govern use of the Dwellsy IQ product.",
};

const LAST_UPDATED = "June 29, 2026";

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
          Dwellsy IQ Terms of Use
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
          These terms govern access to and use of the Dwellsy IQ product. Where
          your organization has a separate signed agreement or order form with
          Dwellsy, that agreement controls and these terms supplement it.
        </p>
        <p className="mt-2 text-[12.5px] text-muted-2">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <Section title="1. Access">
        <p>
          Dwellsy IQ is licensed to organizations, not individuals. Access is
          provisioned by Dwellsy and scoped to the markets your organization has
          licensed. Accounts and credentials are for use by the authorized
          members of your organization and may not be shared outside it.
        </p>
      </Section>

      <Section title="2. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Access markets or data your organization has not licensed, or
            attempt to circumvent access controls.
          </li>
          <li>
            Scrape, bulk-export, resell, or redistribute the data or scorecards
            except as permitted by your agreement.
          </li>
          <li>
            Use the product to build a competing dataset or product, or reverse-
            engineer the methodology or software.
          </li>
          <li>
            Probe, disrupt, or test the security or integrity of the service.
          </li>
        </ul>
      </Section>

      <Section title="3. Intellectual property">
        <p>
          The Dwellsy IQ software, scorecards, rankings, methodology, and
          underlying data are owned by Dwellsy, Inc. and its licensors. Your
          organization receives a limited, non-exclusive, non-transferable right
          to use them for its internal business purposes for the term of your
          agreement.
        </p>
      </Section>

      <Section title="4. Data &amp; confidentiality">
        <p>
          Our handling of data in the product is described in the{" "}
          <a href="/privacy" className="font-semibold text-teal hover:text-teal-700">
            Privacy
          </a>{" "}
          page. The scorecards, rankings, and analyses are confidential and
          provided for your organization&rsquo;s internal use; they are marked
          for institutional use only and should be treated accordingly.
        </p>
      </Section>

      <Section title="5. No investment advice">
        <p>
          Dwellsy IQ provides data and analytics, not investment, legal, or
          financial advice. Outputs are estimates derived from observed market
          signals and a stated methodology, and may contain errors or omissions.
          You are responsible for your own diligence and decisions.
        </p>
      </Section>

      <Section title="6. Warranties &amp; liability">
        <p>
          The service is provided &ldquo;as is.&rdquo; To the extent permitted by
          law and except as set out in a signed agreement, Dwellsy disclaims
          implied warranties and is not liable for indirect or consequential
          losses arising from use of the product. Any specific warranties,
          service levels, or liability limits are set out in your signed
          agreement.
        </p>
      </Section>

      <Section title="7. Term &amp; termination">
        <p>
          Access continues for the term of your agreement. We may suspend or
          terminate access for breach of these terms or non-payment, and you may
          stop using the service at any time. Provisions that by their nature
          should survive termination (intellectual property, confidentiality,
          disclaimers) will survive.
        </p>
      </Section>

      <Section title="8. Changes">
        <p>
          We may update these terms as the product evolves. Material changes will
          be reflected here with an updated date. Continued use after an update
          constitutes acceptance of the revised terms.
        </p>
      </Section>

      <Section title="9. Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <a
            href="mailto:operatoriq@dwellsy.com?subject=Terms%20of%20Use%20inquiry"
            className="font-semibold text-teal hover:text-teal-700"
          >
            operatoriq@dwellsy.com
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
