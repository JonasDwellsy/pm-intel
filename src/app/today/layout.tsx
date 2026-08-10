import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Today · Dwellsy IQ Online" },
  description: "The owner attention queue for markets, assets, comps, and operators.",
  robots: { index: false, follow: false },
};

export default function TodayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
