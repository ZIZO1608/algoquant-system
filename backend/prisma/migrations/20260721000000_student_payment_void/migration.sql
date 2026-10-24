-- AlterTable
ALTER TABLE "student_payments" ADD COLUMN "voided_at" TIMESTAMP(3),
ADD COLUMN "voided_by" TEXT,
ADD COLUMN "void_reason" TEXT;

-- AddForeignKey
ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
