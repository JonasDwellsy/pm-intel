import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";
import { SearchOverlayProvider } from "@/components/search/SearchOverlay";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Dwellsy IQ — Property Manager Intelligence",
    template: "%s · Dwellsy IQ",
  },
  description:
    "Independent, data-driven scorecards on property managers across U.S. rental markets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <PostHogProvider>
          <SearchOverlayProvider>
            <SiteHeader />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </SearchOverlayProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
