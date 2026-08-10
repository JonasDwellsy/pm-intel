import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { MarketIqTrendImporter } from "@/components/market-iq/MarketIqTrendImporter";
import { isAdminUser } from "@/lib/auth/is-admin";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";

export default async function MarketIqTrendImportPage() {
  if (!marketIqPreviewEnabled()) notFound();
  const { userId } = await auth();
  if (!isAdminUser(userId)) notFound();
  return <MarketIqTrendImporter />;
}
