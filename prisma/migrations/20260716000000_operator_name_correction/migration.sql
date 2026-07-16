-- v0.25 — Admin operator display-name corrections.
--
-- Additive-only: one CREATE TABLE + one unique index. No DROP/ALTER of
-- any existing table. Written by /admin/names; applied live on save and
-- re-applied by prisma/seed.ts on every reseed (this table is never
-- deleted by the seed, so corrections persist).

-- CreateTable
CREATE TABLE "OperatorNameCorrection" (
    "id" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "correctedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "decidedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorNameCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorNameCorrection_targetKind_targetKey_key" ON "OperatorNameCorrection"("targetKind", "targetKey");
