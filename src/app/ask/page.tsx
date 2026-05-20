import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { AskChat } from "./AskChat";

// /ask — natural-language interface, Claude tool-calling, streaming
// responses. The page is a thin server wrapper that resolves the current
// seed's dataAsOf for the footer copy + chat input bar; everything
// interactive lives in AskChat (client).
//
// Dynamic because the conversation is per-request and we don't want
// any caching at the route level.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ask Dwellsy IQ",
  description:
    "Natural-language interface for operator scorecards, market intelligence, and methodology questions across Dwellsy IQ's 7 covered markets.",
};

export default async function AskPage() {
  // Pull dataAsOf for the footer line. Cheap one-row query.
  const seedPm = await prisma.pM.findFirst({
    select: { dataAsOf: true },
  });
  const dataAsOf = seedPm?.dataAsOf.toISOString().slice(0, 10) ?? "2026-05-19";

  return (
    <div className="flex min-h-[calc(100vh-76px-200px)] flex-col bg-background">
      <AskChat dataAsOf={dataAsOf} />
    </div>
  );
}
