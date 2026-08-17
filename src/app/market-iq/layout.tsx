import type { Metadata } from "next";
import { MarketIqAppFooter } from "@/components/market-iq/MarketIqAppFooter";
import { MarketIqAppHeader } from "@/components/market-iq/MarketIqAppHeader";

export const metadata: Metadata = {
  title: { absolute: "Market IQ | Dwellsy IQ" },
  description: "Local rental-market intelligence for property managers and their clients.",
  robots: { index: false, follow: false },
};

export default function MarketIqLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f4] text-foreground">
      <MarketIqAppHeader />
      <div className="flex-1">{children}</div>
      <MarketIqAppFooter />
    </div>
  );
}
