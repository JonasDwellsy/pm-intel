import type { Metadata } from "next";

// v0.22 — public Privacy page for the Dwellsy IQ Markets product. It SUPPLEMENTS
// Dwellsy's company-wide Privacy Policy (dwellsy.com/pages/privacy-policy)
// with product-specific data-handling detail grounded in the engineering
// PRIVACY.md (the factual record of what the observability stack does/does
// not capture). Entity, contact, and California-rights framing are aligned
// to the corporate policy. Public route — no auth gate.

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How the Dwellsy IQ Markets product handles data — a product supplement to Dwellsy's company-wide Privacy Policy.",
};

const LAST_UPDATED = "June 29, 2026";
const CORPORATE_POLICY = "https://dwellsy.com/pages/privacy-policy";

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

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-14">
      <header className="border-b border-grid pb-6">
        <p className="dq-eyebrow text-teal">Privacy</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-navy">
          Privacy at Dwellsy IQ Markets
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
          Dwellsy IQ Markets is an institutional intelligence product operated by
          Dwellsy, Inc. This page describes how data is handled in the product
          itself and{" "}
          <strong className="font-semibold text-navy">supplements</strong>{" "}
          Dwellsy&rsquo;s company-wide{" "}
          <a
            href={CORPORATE_POLICY}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-teal hover:text-teal-700"
          >
            Privacy Policy
          </a>
          , which governs generally. It is written to be specific about what we
          collect — and what we deliberately do not.
        </p>
        <p className="mt-2 text-[12.5px] text-muted-2">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <Section title="Account &amp; access data">
        <p>
          Access to Dwellsy IQ Markets is provisioned per organization. We rely on our
          authentication provider (Clerk) to manage sign-in. Your organization,
          its members, and each member&rsquo;s role are stored so we can scope
          access to the markets your organization has licensed.
        </p>
        <p>
          We identify activity by an opaque user identifier, not by your name or
          email. Email addresses and names live in the authentication provider
          and are used to sign you in and send organization invitations.
        </p>
      </Section>

      <Section title="Product analytics">
        <p>
          We use product analytics to understand how the application is used —
          which pages and markets are viewed, when watch lists are created, and
          how search and the AI assistant are used. These events are attributed
          to your opaque user identifier.
        </p>
        <p>
          For organization-invitation activity we record only the{" "}
          <em>domain</em> of an invited email address (for example,
          &ldquo;@company.com&rdquo;), never the individual address, so we can
          understand invite patterns without identifying people.
        </p>
      </Section>

      <Section title="Error monitoring">
        <p>
          We use error monitoring to detect and fix problems. When an error
          occurs we capture the page involved and a technical stack trace, plus
          the opaque user identifier when available. Built-in collection of IP
          addresses, cookies, and user-agent details is turned off.
        </p>
      </Section>

      <Section title="Session replay &amp; masking">
        <p>
          Where session replay is used to diagnose usability issues, it runs
          with privacy masking on: every form field is masked, sensitive
          on-screen values (such as rent figures and scorecard numbers) are
          masked, and the hosted sign-in screen is never recorded.
        </p>
      </Section>

      <Section title="What we deliberately do not capture">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Email addresses, names, phone numbers, or profile photos attached to
            analytics or error events — identification is by opaque identifier
            only.
          </li>
          <li>
            The text of your AI-assistant questions or search queries — only the
            character length is recorded.
          </li>
          <li>
            The underlying scorecard numbers (rents, days-on-market, portfolio
            estimates, percentiles), operator financial details, claim-form
            free-text, or watch-list criterion values.
          </li>
          <li>The local part of invited email addresses (the part before the @).</li>
        </ul>
      </Section>

      <Section title="Sharing">
        <p>
          Consistent with Dwellsy&rsquo;s company-wide policy,{" "}
          <strong className="font-semibold text-navy">
            we do not sell, rent, or lease customer information
          </strong>
          . Data is processed by the infrastructure and observability vendors
          that run the product (hosting, authentication, analytics, and error
          monitoring) solely to operate Dwellsy IQ Markets on our behalf.
        </p>
      </Section>

      <Section title="California privacy rights">
        <p>
          California residents have the right to know what personal information
          we have collected, used, and disclosed, and to request its deletion.
          Dwellsy does not &ldquo;sell&rdquo; personal information within the
          meaning of the CCPA. To exercise these rights, contact{" "}
          <a
            href="mailto:privacy@dwellsy.com?subject=California%20privacy%20request"
            className="font-semibold text-teal hover:text-teal-700"
          >
            privacy@dwellsy.com
          </a>
          . See the full{" "}
          <a
            href={CORPORATE_POLICY}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-teal hover:text-teal-700"
          >
            company Privacy Policy
          </a>{" "}
          for the complete California Privacy Rights section.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Privacy questions or data requests:{" "}
          <a
            href="mailto:privacy@dwellsy.com?subject=Privacy%20inquiry"
            className="font-semibold text-teal hover:text-teal-700"
          >
            privacy@dwellsy.com
          </a>{" "}
          or (202) 601-3675.
        </p>
        <p className="text-[13px] text-muted-foreground">
          Dwellsy, Inc., 171 Main St. Suite 164, Los Altos, CA 94022.
        </p>
      </Section>
    </main>
  );
}
