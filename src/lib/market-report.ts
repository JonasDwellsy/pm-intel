import { z } from "zod";

export const marketReportRequestSchema = z.object({
  marketId: z.string().min(1).max(100),
  email: z.string().trim().email().max(320),
  source: z.string().max(2048).optional(),
  companyWebsite: z.string().max(200).optional(),
});

export type MarketReportRequest = z.infer<typeof marketReportRequestSchema>;

export function normalizeMarketReportEmail(email: string): string {
  return email.trim().toLowerCase();
}
