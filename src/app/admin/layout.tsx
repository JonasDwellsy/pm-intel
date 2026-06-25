// v0.21 — Shared admin layout.
//
// Wraps every /admin/* surface. Two jobs:
//
//   1. Centralize the auth gate. Each admin page previously inlined
//      `auth() → isAdminUser → notFound()` — now that the panel has
//      multiple tabs, it lives here so a new sub-page can't ship
//      without the gate by accident.
//
//   2. Render the shared tab nav so admins can move between Markets
//      and Organizations without bouncing back through SiteHeader.
//
// Auth gate intentionally returns notFound() (404) rather than 403:
// see src/lib/auth/is-admin.ts for the route-existence-hiding rationale.
//
// noindex applies via per-page metadata.robots; layouts don't merge
// robots() so individual pages still set `robots: { index: false }`.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth/is-admin";
import { AdminTabs } from "@/components/admin/AdminTabs";

export const metadata: Metadata = {
  // Admin surfaces are internal-only; belt-and-suspenders alongside the
  // per-page robots flag.
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) notFound();

  return (
    <main className="bg-white min-h-screen">
      <div className="mx-auto max-w-[1100px] px-6 pt-8">
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-teal-700 mb-2">
            Admin
          </p>
          <AdminTabs />
        </header>
      </div>
      {children}
    </main>
  );
}
