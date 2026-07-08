import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateDigestPreference } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const pref = await prisma.digestPreference.findUnique({ where: { userId } });
  const subscribed = !(pref?.unsubscribed ?? false);
  const cadence = pref?.cadence ?? "monthly";

  return (
    <div className="mx-auto max-w-[640px] px-6 py-10 sm:px-10">
      <h1 className="text-xl font-semibold text-navy">Notification settings</h1>
      <form action={updateDigestPreference} className="mt-6 space-y-6">
        <section className="rounded-lg border border-grid p-5">
          <h2 className="text-sm font-semibold text-navy">Watch-list email digest</h2>
          <p className="mt-1 text-sm text-slate-600">
            A summary of how your watched operators changed. Cadence is a maximum —
            you&apos;re only emailed when something actually changes.
          </p>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" name="subscribed" defaultChecked={subscribed} />
            Email me the digest
          </label>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-navy">Frequency</legend>
            {(["daily", "weekly", "monthly"] as const).map((c) => (
              <label key={c} className="mt-1 flex items-center gap-2 text-sm capitalize">
                <input type="radio" name="cadence" value={c} defaultChecked={cadence === c} />
                {c}
              </label>
            ))}
          </fieldset>
        </section>
        <button
          type="submit"
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white"
        >
          Save
        </button>
      </form>
    </div>
  );
}
