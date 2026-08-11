"use client";

import { usePathname } from "next/navigation";

export function ProductContextLabel({ ownerMode = false }: { ownerMode?: boolean }) {
  const pathname = usePathname() ?? "";
  const label = ownerMode
    ? "Dwellsy IQ Online"
    : pathname.startsWith("/today")
    ? "Dwellsy IQ Online"
    : pathname.startsWith("/portfolio-iq")
    ? "Portfolio IQ"
    : pathname.startsWith("/market-iq")
      ? "Market IQ"
      : "Operator IQ";

  return <>{label}</>;
}
