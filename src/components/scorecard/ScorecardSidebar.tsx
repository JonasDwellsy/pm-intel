import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

type SectionLink = { id: string; label: string };

const FREE_SECTIONS: SectionLink[] = [
  { id: "headline", label: "Headline metrics" },
  { id: "paywall", label: "Paywall" },
];

const UNLOCKED_SECTIONS: SectionLink[] = [
  { id: "headline", label: "Headline metrics" },
  { id: "coverage", label: "Coverage" },
  { id: "geography", label: "Geographic coverage" },
  { id: "performance", label: "Performance" },
  { id: "time-context", label: "Time context" },
  { id: "rent-trajectory", label: "Rent trajectory" },
  { id: "pricing", label: "Pricing" },
  { id: "listing-quality", label: "Listing quality" },
  { id: "coverage-confidence", label: "Coverage confidence" },
  { id: "tenancy", label: "Tenancy" },
  { id: "why-this-quadrant", label: "Why this quadrant" },
];

export function ScorecardSidebar({
  isUnlocked,
  pmSlug,
}: {
  isUnlocked: boolean;
  pmSlug: string;
}) {
  const items = isUnlocked ? UNLOCKED_SECTIONS : FREE_SECTIONS;
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-6 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            On this page
          </p>
          <nav className="mt-2">
            <ul className="space-y-1 text-sm">
              {items.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`#${s.id}`}
                    className="block rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        {isUnlocked && (
          <div className="border-t border-border pt-4">
            <a
              href={`/api/pms/${pmSlug}/pdf?user=guest`}
              className={buttonVariants({ variant: "outline", className: "w-full" })}
            >
              Download PDF
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              PDF export wires in Session 6.
            </p>
          </div>
        )}
        <div className="border-t border-border pt-4 text-xs text-muted-foreground">
          <Link href="/methodology" className="hover:text-foreground">
            How scoring works →
          </Link>
        </div>
      </div>
    </aside>
  );
}
