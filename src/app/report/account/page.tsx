// v0.33 — Buyer wallet. PUBLIC, force-dynamic.
//
// Replaces the subscription hub: there is no recurring SKU any more. What a
// three-pack buyer needs instead is the reports they own, the credits they
// have left, and a way to spend one.
//
// Guest-or-org, keyed exactly like the entitlement resolver: a signed-in
// workspace user by organizationId, a guest by a verified magic-link email.

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { verifyReportAccessToken } from "@/lib/report/access-token";
import { ReportShell } from "@/components/report/ReportShell";
import { countUnredeemed } from "@/lib/billing/credits.server";
import type { CreditOwner } from "@/lib/billing/credits";
import { RedeemCreditForm } from "./RedeemCreditForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your reports",
  robots: { index: false, follow: false },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; partner?: string }>;
}) {
  const { token, partner } = await searchParams;
  const { organizationId } = await getActiveOrgContext();
  const guestEmail = organizationId ? null : verifyReportAccessToken(token);
  const identified = Boolean(organizationId || guestEmail);

  const owner: CreditOwner = { organizationId, guestEmail };
  const [owned, credits] = identified
    ? await Promise.all([
        prisma.reportEntitlement.findMany({
          where: organizationId ? { organizationId } : { guestEmail: guestEmail! },
          orderBy: { createdAt: "desc" },
          select: { pmSlug: true, createdAt: true },
        }),
        countUnredeemed(owner),
      ])
    : [[], 0];

  const names = owned.length
    ? await prisma.pM.findMany({
        where: { slug: { in: owned.map((o) => o.pmSlug) } },
        select: { slug: true, name: true },
      })
    : [];
  const nameBySlug = new Map(names.map((n) => [n.slug, n.name]));

  return (
    <ReportShell partner={partner}>
      <main className="bg-[#FBFAF6]">
        <section className="mx-auto max-w-[760px] px-6 pb-20 pt-14">
          <h1 className="text-[28px] font-semibold text-navy">Your reports</h1>

          {!identified ? (
            <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">
              Open this page from the link in your purchase email to see the
              reports you own.{" "}
              <Link href="/report" className="text-teal underline-offset-2 hover:underline">
                Look up a property manager
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="mt-6 rounded-xl border border-navy/15 bg-white p-6">
                <p className="text-[13px] font-medium text-muted-foreground">
                  Reports left to use
                </p>
                <p className="mt-1 text-[32px] font-semibold leading-none text-navy">
                  {credits}
                </p>
                {credits > 0 ? (
                  <>
                    <p className="mt-3 text-[14px] text-muted-foreground">
                      Use one on any property manager. Search for them first if
                      you need their exact name.
                    </p>
                    <RedeemCreditForm token={token ?? null} />
                  </>
                ) : (
                  <p className="mt-3 text-[14px] text-muted-foreground">
                    <Link href="/report" className="text-teal underline-offset-2 hover:underline">
                      Look up another property manager
                    </Link>{" "}
                    to buy more.
                  </p>
                )}
              </div>

              <h2 className="mt-10 text-[18px] font-semibold text-navy">
                Reports you own
              </h2>
              {owned.length === 0 ? (
                <p className="mt-3 text-[14px] text-muted-foreground">
                  Nothing yet.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-navy/10 rounded-xl border border-navy/15 bg-white">
                  {owned.map((o) => (
                    <li key={o.pmSlug} className="flex items-center gap-3 px-5 py-4">
                      <span className="flex-1 text-[15px] font-medium text-navy">
                        {nameBySlug.get(o.pmSlug) ?? o.pmSlug}
                      </span>
                      <Link
                        href={`/report/r/${o.pmSlug}`}
                        className="text-[14px] font-semibold text-teal underline-offset-2 hover:underline"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </main>
    </ReportShell>
  );
}
