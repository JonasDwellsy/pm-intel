"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import { PILOT_INTERVENTION_KINDS, PILOT_INTERVENTION_STATUSES } from "@/lib/portfolio-iq/pilot-interventions";

function textField(formData: FormData, key: string, maxLength: number): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function dateField(formData: FormData, key: string): Date | null {
  const value = textField(formData, key, 10);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function adminPortfolio(formData: FormData) {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) throw new Error("Not found.");
  const portfolioId = textField(formData, "portfolioId", 128);
  if (!portfolioId) throw new Error("Portfolio is required.");
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({ where: { id: portfolioId }, select: { id: true, organizationId: true } });
  if (!portfolio) throw new Error("Portfolio not found.");
  return { userId, portfolio };
}

export async function savePilotSuccessPlan(formData: FormData): Promise<void> {
  const { userId, portfolio } = await adminPortfolio(formData);
  const data = {
    organizationId: portfolio.organizationId,
    staffOwnerName: textField(formData, "staffOwnerName", 120),
    successGoal: textField(formData, "successGoal", 1000),
    nextCheckInAt: dateField(formData, "nextCheckInAt"),
    updatedByUserId: userId,
  };
  await prisma.portfolioIqPilotSuccessPlan.upsert({
    where: { portfolioId: portfolio.id },
    create: { portfolioId: portfolio.id, ...data },
    update: data,
  });
  revalidatePath("/admin/pilot-success");
}

export async function createPilotIntervention(formData: FormData): Promise<void> {
  const { userId, portfolio } = await adminPortfolio(formData);
  const kind = textField(formData, "kind", 30) ?? "note";
  const status = textField(formData, "status", 30) ?? "open";
  const title = textField(formData, "title", 180);
  if (!PILOT_INTERVENTION_KINDS.includes(kind as (typeof PILOT_INTERVENTION_KINDS)[number])) throw new Error("Choose a valid intervention type.");
  if (!PILOT_INTERVENTION_STATUSES.includes(status as (typeof PILOT_INTERVENTION_STATUSES)[number])) throw new Error("Choose a valid status.");
  if (!title) throw new Error("An intervention title is required.");
  await prisma.portfolioIqPilotIntervention.create({ data: {
    portfolioId: portfolio.id,
    organizationId: portfolio.organizationId,
    kind,
    status,
    title,
    note: textField(formData, "note", 2000),
    dueAt: dateField(formData, "dueAt"),
    completedAt: status === "completed" ? new Date() : null,
    assignedTo: textField(formData, "assignedTo", 120),
    createdByUserId: userId,
  } });
  revalidatePath("/admin/pilot-success");
}

export async function updatePilotInterventionStatus(formData: FormData): Promise<void> {
  const { portfolio } = await adminPortfolio(formData);
  const interventionId = textField(formData, "interventionId", 128);
  const status = textField(formData, "status", 30);
  if (!interventionId || !status || !PILOT_INTERVENTION_STATUSES.includes(status as (typeof PILOT_INTERVENTION_STATUSES)[number])) throw new Error("A valid intervention and status are required.");
  const existing = await prisma.portfolioIqPilotIntervention.findFirst({ where: { id: interventionId, portfolioId: portfolio.id, organizationId: portfolio.organizationId }, select: { id: true } });
  if (!existing) throw new Error("Intervention not found.");
  await prisma.portfolioIqPilotIntervention.update({
    where: { id: existing.id },
    data: { status, completedAt: status === "completed" ? new Date() : null },
  });
  revalidatePath("/admin/pilot-success");
}
