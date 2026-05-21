import type { Metadata } from "next";
import { BuyBoxEditor } from "@/components/buy-box/BuyBoxEditor";
import { listMarketOptions } from "@/lib/buy-box/editor-options";

// /buy-boxes/new — blank editor. Server component loads the
// market options for the marketIds picker and hands off to the
// client editor with `initial: null`.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New buy box",
  robots: { index: false, follow: false },
};

export default async function NewBuyBoxPage() {
  const marketOptions = await listMarketOptions();
  return <BuyBoxEditor initial={null} marketOptions={marketOptions} />;
}
