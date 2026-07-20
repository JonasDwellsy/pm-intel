// Shared, email-client-safe branded shell for outbound digests (brief +
// watch-list). Table-based layout with inline styles (no flexbox/grid — Outlook
// et al. ignore them), max 600px, so it renders consistently across clients.
//
// Branding: the PRODUCT is Operator IQ; the umbrella brand is Dwellsy IQ. The
// header wordmark is text (not an image) so it survives image-blocking, which is
// on by default in most clients. Colors mirror the scorecard/PDF palette.

export const EMAIL = {
  ink: "#0f1f3f", // navy headings
  body: "#2a3547",
  slate: "#5b6577",
  faint: "#8894ac",
  teal: "#155772",
  tealBright: "#0E7C86",
  tealTint: "#eef5f8",
  border: "#e6eaf1",
  hairline: "#eef1f6",
  bg: "#f4f6fa",
  card: "#ffffff",
  gold: "#b8860b",
} as const;

/** The Operator IQ wordmark, rendered as styled text (image-blocking-proof). */
function wordmark(): string {
  return `<span style="font-size:18px;font-weight:700;letter-spacing:-0.2px;color:${EMAIL.ink}">Operator<span style="color:${EMAIL.tealBright}"> IQ</span></span>`;
}

/** Small uppercase section eyebrow — reused by the digest bodies for consistency. */
export function emailSectionLabel(text: string): string {
  return `<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL.faint};margin:0 0 8px">${text}</div>`;
}

/** A primary link/CTA rendered as a bordered pill (works without button support). */
export function emailButton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;font-size:13px;font-weight:600;color:${EMAIL.teal};text-decoration:none;border:1px solid ${EMAIL.border};border-radius:8px;padding:9px 14px;background:${EMAIL.tealTint}">${label}</a>`;
}

/**
 * Wrap section HTML in the branded shell. `preheader` is the hidden inbox-preview
 * snippet; `footerNote` explains why they're receiving it; `unsubscribeUrl` +
 * `unsubscribeLabel` render the opt-out.
 */
export function wrapEmail(opts: {
  preheader: string;
  contentHtml: string;
  footerNote: string;
  unsubscribeUrl: string;
  unsubscribeLabel: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${EMAIL.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${opts.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL.bg}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${EMAIL.card};border:1px solid ${EMAIL.border};border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr><td style="padding:20px 28px;border-bottom:1px solid ${EMAIL.hairline}">
    ${wordmark()}
    <span style="font-size:12px;color:${EMAIL.faint};margin-left:8px">from Dwellsy IQ</span>
  </td></tr>
  <tr><td style="padding:24px 28px 8px">
    ${opts.contentHtml}
  </td></tr>
  <tr><td style="padding:18px 28px 24px">
    <div style="border-top:1px solid ${EMAIL.hairline};padding-top:14px">
      <p style="font-size:11px;line-height:1.5;color:${EMAIL.faint};margin:0">
        ${opts.footerNote} <a href="${opts.unsubscribeUrl}" style="color:${EMAIL.faint};text-decoration:underline">${opts.unsubscribeLabel}</a>.
      </p>
      <p style="font-size:11px;color:${EMAIL.faint};margin:8px 0 0">Operator IQ · Dwellsy, Inc.</p>
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
