// v0.21 — /admin index. Bare entry route that redirects to the
// default tab. The shared layout (src/app/admin/layout.tsx) runs
// the auth gate first, so a non-admin hitting /admin gets the
// notFound() route-hide treatment before this redirect runs.

import { redirect } from "next/navigation";

export default function AdminIndex() {
  redirect("/admin/markets");
}
