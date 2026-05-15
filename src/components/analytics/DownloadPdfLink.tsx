"use client";

import { buttonVariants } from "@/components/ui/button";
import { capture } from "@/lib/analytics";

export function DownloadPdfLink({
  pmSlug,
  user = "guest",
  className,
}: {
  pmSlug: string;
  user?: string;
  className?: string;
}) {
  const date = new Date().toISOString().slice(0, 10);
  const href = `/api/pms/${pmSlug}/pdf?user=${encodeURIComponent(user)}&date=${date}`;
  return (
    <a
      href={href}
      className={buttonVariants({
        variant: "outline",
        className: className ?? "w-full",
      })}
      onClick={() => capture("pdf_export_click", { pmSlug })}
    >
      Download PDF
    </a>
  );
}
