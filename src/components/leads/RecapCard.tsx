import Link from "next/link";
import { PROPERTY_TYPE_LABELS, type PropertyType } from "@/lib/lead-schema";

type RecapField = {
  label: string;
  value: string | null | undefined;
};

export function RecapCard({
  propertyType,
  unitCount,
  marketName,
  preferredQuadrant,
  editHref,
}: {
  propertyType: string;
  unitCount: number | null;
  marketName: string | null;
  preferredQuadrant: string | null;
  editHref: string;
}) {
  const fields: RecapField[] = [
    {
      label: "Property type",
      value:
        PROPERTY_TYPE_LABELS[propertyType as PropertyType] ?? propertyType,
    },
    {
      label: "Unit count",
      value: unitCount !== null ? String(unitCount) : "—",
    },
    {
      label: "Market",
      value: marketName ?? "No preference",
    },
    {
      label: "Preferred op.",
      value: preferredQuadrant ?? "No preference",
    },
  ];

  return (
    <section className="rounded-lg bg-[#F4F2EC] p-7 sm:p-8 sm:px-9">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Your submission
        </p>
        <Link
          href={editHref}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-teal hover:text-teal-700"
        >
          <svg
            aria-hidden
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit and resubmit →
        </Link>
      </div>
      <div className="border-t border-[#E6E2D6] pt-5">
        <dl className="grid grid-cols-2 gap-x-7 gap-y-5 sm:grid-cols-4">
          {fields.map((f) => (
            <div key={f.label}>
              <dt className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {f.label}
              </dt>
              <dd className="text-[14.5px] font-medium leading-snug tracking-[-0.005em] text-navy">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
