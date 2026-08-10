import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Portfolio IQ preview · Dwellsy IQ" },
  description: "Owner-specific portfolio intelligence powered by Dwellsy data.",
  robots: { index: false, follow: false },
};

export default function PortfolioIqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
