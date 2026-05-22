"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics";
import { ClerkIdentify } from "./ClerkIdentify";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);
  // ClerkIdentify is a side-effect-only leaf — it reads the Clerk
  // session (which exists because <ClerkProvider> is an ancestor in
  // layout.tsx) and calls posthog.identify() on sign-in transitions.
  // Mount it INSIDE this provider so initAnalytics() has run by the
  // time ClerkIdentify's first effect fires.
  return (
    <>
      <ClerkIdentify />
      {children}
    </>
  );
}
