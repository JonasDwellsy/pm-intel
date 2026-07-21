-- CreateTable
CREATE TABLE "PropertyHome" (
    "id" TEXT NOT NULL,
    "pmSlug" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "submarket" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "medianRentT12" INTEGER,
    "domT12" INTEGER,
    "lastListedDate" TIMESTAMP(3),
    "nListings" INTEGER NOT NULL DEFAULT 0,
    "concession" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyHome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyHome_pmSlug_addressId_key" ON "PropertyHome"("pmSlug", "addressId");

-- CreateIndex
CREATE INDEX "PropertyHome_pmSlug_idx" ON "PropertyHome"("pmSlug");
