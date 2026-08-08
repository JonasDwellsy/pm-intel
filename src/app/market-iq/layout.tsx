import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market IQ preview",
  description: "High-frequency asking-market intelligence from Dwellsy IQ.",
  robots: { index: false, follow: false },
};

export default function MarketIqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
