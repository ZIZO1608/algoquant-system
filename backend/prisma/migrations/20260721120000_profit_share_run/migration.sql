-- CreateEnum
CREATE TYPE "ProfitShareRunStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "profit_share_runs" (
    "id" TEXT NOT NULL,
    "period_yyyy_mm" TEXT NOT NULL,
    "status" "ProfitShareRunStatus" NOT NULL DEFAULT 'pending',
    "net_profit_minor" BIGINT NOT NULL,
    "labor_cost_minor" BIGINT NOT NULL,
    "lines_json" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decided_by" TEXT,

    CONSTRAINT "profit_share_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profit_share_runs_period_yyyy_mm_key" ON "profit_share_runs"("period_yyyy_mm");

-- AddForeignKey
ALTER TABLE "profit_share_runs" ADD CONSTRAINT "profit_share_runs_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
