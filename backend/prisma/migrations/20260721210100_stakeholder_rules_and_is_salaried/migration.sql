-- StakeholderRule table (replaces SettingsFinance.stakeholder_profit_rules JSON)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "stakeholder_rules" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stakeholder_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stakeholder_rules_employee_id_key" ON "stakeholder_rules"("employee_id");

ALTER TABLE "stakeholder_rules"
  ADD CONSTRAINT "stakeholder_rules_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate existing JSON rules (if any) into rows
INSERT INTO "stakeholder_rules" ("id", "employee_id", "percent", "created_at")
SELECT
  gen_random_uuid()::text,
  elem->>'employeeId',
  (elem->>'percent')::double precision,
  CURRENT_TIMESTAMP
FROM "settings_finance" sf,
  LATERAL jsonb_array_elements(
    CASE
      WHEN sf."stakeholder_profit_rules" IS NULL THEN '[]'::jsonb
      WHEN jsonb_typeof(sf."stakeholder_profit_rules"::jsonb) = 'array'
      THEN sf."stakeholder_profit_rules"::jsonb
      ELSE '[]'::jsonb
    END
  ) AS elem
WHERE elem->>'employeeId' IS NOT NULL
  AND elem->>'percent' IS NOT NULL
  AND EXISTS (SELECT 1 FROM "employees" e WHERE e."id" = elem->>'employeeId')
ON CONFLICT ("employee_id") DO NOTHING;

ALTER TABLE "settings_finance" DROP COLUMN IF EXISTS "stakeholder_profit_rules";

-- Replace EmploymentType enum with is_salaried boolean
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "is_salaried" BOOLEAN NOT NULL DEFAULT true;

UPDATE "employees"
SET "is_salaried" = ("employment_type"::text = 'salary');

ALTER TABLE "employees" DROP COLUMN IF EXISTS "employment_type";

DROP TYPE IF EXISTS "EmploymentType";
