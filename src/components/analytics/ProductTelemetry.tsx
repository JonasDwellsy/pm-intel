"use client";
import {usePathname} from "next/navigation";
import {Analytics} from "@vercel/analytics/next";
import {SpeedInsights} from "@vercel/speed-insights/next";
export function ProductTelemetry() {
  const pathname=usePathname();
  if(pathname?.startsWith("/iq/"))return null;
  return <><Analytics/><SpeedInsights/></>;
}
