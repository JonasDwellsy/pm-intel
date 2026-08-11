"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import { parseManualPropertyLines, parseSpreadsheetRows, type OnboardingPropertyDraft } from "@/lib/portfolio-iq/onboarding";

async function onboardingAuthority(portfolioId: string | null): Promise<{ userId: string; organizationId: string; portfolioId: string | null }> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  if (!userId || !organizationId) throw new Error("Workspace not ready.");
  if (!portfolioId) return { userId, organizationId, portfolioId: null };
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({ where: { id: portfolioId }, select: { id: true, organizationId: true, isSynthetic: true } });
  if (!portfolio || (portfolio.organizationId !== organizationId && !(portfolio.isSynthetic && isAdminUser(userId)))) throw new Error("Portfolio not found.");
  return { userId, organizationId: portfolio.organizationId, portfolioId: portfolio.id };
}

async function ensureRequest(organizationId: string, portfolioId: string | null) {
  return prisma.portfolioIqOnboardingRequest.upsert({
    where: { organizationId },
    create: { organizationId, portfolioId },
    update: { portfolioId: portfolioId ?? undefined },
  });
}

export async function requestOnboardingSession(formData: FormData): Promise<void> {
  const portfolioId = String(formData.get("portfolioId") ?? "").trim() || null;
  const authority = await onboardingAuthority(portfolioId);
  const contactName = String(formData.get("contactName") ?? "").trim().slice(0, 120);
  const contactEmail = String(formData.get("contactEmail") ?? "").trim().slice(0, 200);
  const contactPhone = String(formData.get("contactPhone") ?? "").trim().slice(0, 80) || null;
  const preferredContactWindow = String(formData.get("preferredContactWindow") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim().slice(0, 80);
  const intakeNotes = String(formData.get("intakeNotes") ?? "").trim().slice(0, 1200) || null;
  if (!contactName || !contactEmail || !["morning", "afternoon", "flexible"].includes(preferredContactWindow) || !timezone) {
    throw new Error("Complete the contact name, email, time preference, and timezone.");
  }
  const request = await ensureRequest(authority.organizationId, authority.portfolioId);
  await prisma.portfolioIqOnboardingRequest.update({
    where: { id: request.id },
    data: { status: "call_requested", contactName, contactEmail, contactPhone, preferredContactWindow, timezone, intakeNotes, callRequestedAt: new Date() },
  });
  revalidatePath("/onboarding");
  revalidatePath("/admin/portfolio-activation");
}

async function spreadsheetDrafts(file: File | null): Promise<OnboardingPropertyDraft[]> {
  if (!file || file.size === 0) return [];
  if (file.size > 5_000_000) throw new Error("Keep the property file under 5 MB.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return parseSpreadsheetRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
}

export async function submitPortfolioIntake(formData: FormData): Promise<void> {
  const portfolioId = String(formData.get("portfolioId") ?? "").trim() || null;
  const authority = await onboardingAuthority(portfolioId);
  const manual = parseManualPropertyLines(String(formData.get("propertyLines") ?? ""));
  const fileValue = formData.get("propertyFile");
  const fromFile = await spreadsheetDrafts(fileValue instanceof File ? fileValue : null);
  const drafts = [...manual, ...fromFile].slice(0, 500);
  if (!drafts.length) throw new Error("Add at least one property address or upload a property file.");
  const request = await ensureRequest(authority.organizationId, authority.portfolioId);
  await prisma.$transaction(async (tx) => {
    for (const draft of drafts) {
      await tx.portfolioIqOnboardingProperty.upsert({
        where: { requestId_addressLine: { requestId: request.id, addressLine: draft.addressLine } },
        create: { requestId: request.id, ...draft },
        update: { propertyName: draft.propertyName, city: draft.city, state: draft.state, postalCode: draft.postalCode, unitCount: draft.unitCount, assetType: draft.assetType, sourceKind: draft.sourceKind },
      });
    }
    await tx.portfolioIqOnboardingRequest.update({
      where: { id: request.id },
      data: { intakeReceivedAt: new Date(), status: request.status === "started" ? "intake_received" : request.status },
    });
  });
  revalidatePath("/onboarding");
  revalidatePath("/admin/portfolio-activation");
}
