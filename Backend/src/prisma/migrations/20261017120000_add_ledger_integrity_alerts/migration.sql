-- CreateTable
CREATE TABLE "LedgerIntegrityAlert" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "stored_balance" DECIMAL(65,30) NOT NULL,
    "computed_balance" DECIMAL(65,30) NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,

    CONSTRAINT "LedgerIntegrityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerIntegrityAlert_customer_id_idx" ON "LedgerIntegrityAlert"("customer_id");

-- CreateIndex
CREATE INDEX "LedgerIntegrityAlert_resolved_idx" ON "LedgerIntegrityAlert"("resolved");

-- CreateIndex
CREATE INDEX "LedgerIntegrityAlert_detected_at_idx" ON "LedgerIntegrityAlert"("detected_at");

-- AddForeignKey
ALTER TABLE "LedgerIntegrityAlert" ADD CONSTRAINT "LedgerIntegrityAlert_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
