import Image from "next/image";
import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { MarketIqAppNavigation } from "@/components/market-iq/MarketIqAppNavigation";

async function signedIn() {
  try {
    return Boolean((await auth()).userId);
  } catch {
    return false;
  }
}

export async function MarketIqAppHeader() {
  const isSignedIn = await signedIn();

  return (
    <header className="sticky top-0 z-40 border-b border-grid bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-7 lg:px-10">
        <Link href={isSignedIn ? "/market-iq" : "/market-iq/welcome"} aria-label="Dwellsy IQ Market IQ home" className="flex shrink-0 items-center gap-3 text-navy">
          <Image src="/dwellsy-iq-logo.png" alt="Dwellsy IQ" width={119} height={37} priority className="h-9 w-auto" />
          <span aria-hidden className="h-6 w-px bg-grid" />
          <span className="text-sm font-bold tracking-tight sm:text-base">Market IQ</span>
        </Link>

        <div className="flex items-center gap-2 lg:gap-4">
          <MarketIqAppNavigation signedIn={isSignedIn} />
          <span aria-hidden className="hidden h-6 w-px bg-grid lg:block" />
          {isSignedIn ? (
            <>
              <div className="hidden items-center gap-2 sm:flex">
                <div className="max-w-[170px] [&_.cl-organizationSwitcherTrigger]:!h-[34px] [&_.cl-organizationPreviewMainIdentifier]:!truncate">
                  <OrganizationSwitcher
                    hidePersonal={false}
                    afterCreateOrganizationUrl="/market-iq"
                    afterSelectOrganizationUrl="/market-iq"
                    afterLeaveOrganizationUrl="/market-iq"
                    appearance={{ elements: {
                      organizationSwitcherTrigger: "py-1 px-2 rounded-md hover:bg-surface-soft",
                      organizationPreviewAvatarBox: "h-[26px] w-[26px]",
                      organizationPreviewMainIdentifier: "text-[13px] font-medium text-navy",
                    } }}
                  />
                </div>
                <UserButton appearance={{ elements: { avatarBox: "h-[30px] w-[30px]" } }}>
                  <UserButton.MenuItems>
                    <UserButton.Link label="Workspace setup" labelIcon={<span aria-hidden>⚙</span>} href="/market-iq/get-started" />
                    <UserButton.Link label="Plan and billing" labelIcon={<span aria-hidden>▣</span>} href="/market-iq/subscribe" />
                  </UserButton.MenuItems>
                </UserButton>
              </div>
              <div className="sm:hidden">
                <UserButton appearance={{ elements: { avatarBox: "h-[30px] w-[30px]" } }} />
              </div>
            </>
          ) : (
            <Link href="/sign-in?redirect_url=/market-iq" className="hidden rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white sm:inline-flex">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
