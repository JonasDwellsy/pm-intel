"use client";

import Link from "next/link";
import { capture, type EventName, type EventProps } from "@/lib/analytics";

type LinkProps = React.ComponentProps<typeof Link>;

export function TrackedLink({
  event,
  properties,
  onClick,
  ...rest
}: { event: EventName; properties?: EventProps } & LinkProps) {
  return (
    <Link
      {...rest}
      onClick={(e) => {
        capture(event, properties ?? {});
        onClick?.(e);
      }}
    />
  );
}
