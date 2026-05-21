import type { Metadata } from "next";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { listBuyBoxes } from "@/lib/buy-box/store";

// /buy-boxes — minimal admin page. PR 1 ships a table listing what's
// in the BuyBox database with criterion counts; the real list view +
// editor UI lands in PR 2. The Apply link points at the JSON API
// endpoint so the result shape can be eyeballed without UI work.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buy Boxes (admin)",
  robots: { index: false, follow: false },
};

export default async function BuyBoxesAdminPage() {
  const rows = await listBuyBoxes();

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-[1080px] px-6 py-12">
        <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
          Buy Box · v0.8 admin
        </p>
        <h1 className="mt-2 text-[30px] font-semibold leading-[1.15] tracking-[-0.012em] text-navy sm:text-[36px]">
          Buy Boxes
        </h1>
        <p className="mt-3 max-w-[60ch] text-[14.5px] text-foreground/80">
          Foundation view — PR 1 ships the data layer + evaluator + scoring +
          CRUD API + this listing. The editor UI and ranked results table land
          in PR 2. <code className="dq-mono">Apply (debug)</code> on any row
          hits the apply endpoint and dumps the JSON result.
        </p>

        {rows.length === 0 ? (
          <div className="mt-8 rounded-lg border border-grid bg-white p-6 text-[14px] text-muted-foreground">
            No buy boxes in the database. Run{" "}
            <span className="dq-mono">FORCE_SEED=true npx prisma db seed</span>{" "}
            to populate the Evernest + Genstone starter templates.
          </div>
        ) : (
          <table className="dq-table mt-8 w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th className="text-right">Req</th>
                <th className="text-right">Pref</th>
                <th className="text-right">Excl</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((bb) => (
                <tr key={bb.id}>
                  <td className="font-semibold text-navy">{bb.name}</td>
                  <td className="text-[13px] text-foreground/70">
                    {bb.description ?? <span className="text-muted-2">—</span>}
                  </td>
                  <td className="dq-mono text-right">
                    {bb.requiredCriteria.length}
                  </td>
                  <td className="dq-mono text-right">
                    {bb.preferredCriteria.length}
                  </td>
                  <td className="dq-mono text-right">
                    {bb.excludedCriteria.length}
                  </td>
                  <td className="text-[12px] text-muted-foreground dq-mono">
                    {fmtDate(bb.updatedAt.toISOString())}
                  </td>
                  <td>
                    <Link
                      href={`/api/buy-boxes/${bb.id}/apply`}
                      // The apply endpoint is POST; this anchor is for
                      // documentation. PR 2's UI will trigger the POST
                      // via a form action. For now, devs can curl:
                      //   curl -X POST /api/buy-boxes/{id}/apply
                      className="text-[13px] font-semibold text-teal hover:text-teal-700 hover:underline"
                    >
                      Apply (debug) →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-10 text-[12px] text-muted-foreground">
          Total buy boxes in database: {rows.length}. Apply endpoint:{" "}
          <span className="dq-mono">POST /api/buy-boxes/[id]/apply</span>.
        </p>
      </div>
    </div>
  );
}
