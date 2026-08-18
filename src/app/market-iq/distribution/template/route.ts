const template = [
  "Name,Email,Company,Relationship",
  "Jamie Rivera,jamie@example.com,Rivera Holdings,Current client",
  "Morgan Lee,morgan@example.com,Lee Investments,Prospect",
].join("\r\n");

export async function GET() {
  return new Response(template, {
    headers: {
      "Content-Disposition": 'attachment; filename="market-iq-recipient-template.csv"',
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
