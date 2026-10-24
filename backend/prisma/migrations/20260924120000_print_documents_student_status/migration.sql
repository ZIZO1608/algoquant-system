-- Overall student status (per-course status stays on enrollments)
CREATE TYPE "StudentStatus" AS ENUM ('active', 'frozen', 'graduated', 'withdrawn', 'blocked');

ALTER TABLE "students" ADD COLUMN "status" "StudentStatus" NOT NULL DEFAULT 'active',
ADD COLUMN "status_changed_at" TIMESTAMP(3),
ADD COLUMN "status_reason" TEXT;

CREATE INDEX "students_status_idx" ON "students"("status");

-- Printed document numbers. SERIAL numbers existing rows in physical order;
-- renumber them by date so old receipts read chronologically, then move each sequence past the max.
ALTER TABLE "student_payments" ADD COLUMN "receipt_no" SERIAL NOT NULL;
ALTER TABLE "expenses" ADD COLUMN "voucher_no" SERIAL NOT NULL;
ALTER TABLE "owner_withdrawals" ADD COLUMN "voucher_no" SERIAL NOT NULL;
ALTER TABLE "wallet_withdrawal_requests" ADD COLUMN "voucher_no" SERIAL NOT NULL;
ALTER TABLE "refunds" ADD COLUMN "voucher_no" SERIAL NOT NULL;

UPDATE "student_payments" t SET "receipt_no" = o.n
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY paid_at, id) AS n FROM "student_payments") o WHERE t.id = o.id;
UPDATE "expenses" t SET "voucher_no" = o.n
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM "expenses") o WHERE t.id = o.id;
UPDATE "owner_withdrawals" t SET "voucher_no" = o.n
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM "owner_withdrawals") o WHERE t.id = o.id;
UPDATE "wallet_withdrawal_requests" t SET "voucher_no" = o.n
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM "wallet_withdrawal_requests") o WHERE t.id = o.id;
UPDATE "refunds" t SET "voucher_no" = o.n
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM "refunds") o WHERE t.id = o.id;

SELECT setval(pg_get_serial_sequence('student_payments', 'receipt_no'), GREATEST((SELECT MAX("receipt_no") FROM "student_payments"), 1), (SELECT COUNT(*) > 0 FROM "student_payments"));
SELECT setval(pg_get_serial_sequence('expenses', 'voucher_no'), GREATEST((SELECT MAX("voucher_no") FROM "expenses"), 1), (SELECT COUNT(*) > 0 FROM "expenses"));
SELECT setval(pg_get_serial_sequence('owner_withdrawals', 'voucher_no'), GREATEST((SELECT MAX("voucher_no") FROM "owner_withdrawals"), 1), (SELECT COUNT(*) > 0 FROM "owner_withdrawals"));
SELECT setval(pg_get_serial_sequence('wallet_withdrawal_requests', 'voucher_no'), GREATEST((SELECT MAX("voucher_no") FROM "wallet_withdrawal_requests"), 1), (SELECT COUNT(*) > 0 FROM "wallet_withdrawal_requests"));
SELECT setval(pg_get_serial_sequence('refunds', 'voucher_no'), GREATEST((SELECT MAX("voucher_no") FROM "refunds"), 1), (SELECT COUNT(*) > 0 FROM "refunds"));
