-- Add follow-up reminder fields (independent of funnel status)
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "next_follow_up_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "follow_up_flagged_at" TIMESTAMP(3);

-- Bucket obsolete statuses into real funnel stages before enum rebuild
UPDATE "leads"
SET "status" = 'interested',
    "next_follow_up_at" = COALESCE("next_follow_up_at", CURRENT_TIMESTAMP)
WHERE "status" = 'follow_up';

UPDATE "leads"
SET "status" = 'interested'
WHERE "status" = 'negotiating';

-- Rebuild LeadStatus without follow_up / negotiating
CREATE TYPE "LeadStatus_new" AS ENUM (
  'new',
  'contacted',
  'interested',
  'paid',
  'enrolled',
  'archived',
  'lost'
);

ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "leads"
  ALTER COLUMN "status" TYPE "LeadStatus_new"
  USING ("status"::text::"LeadStatus_new");
ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'new'::"LeadStatus_new";

DROP TYPE "LeadStatus";
ALTER TYPE "LeadStatus_new" RENAME TO "LeadStatus";

CREATE INDEX IF NOT EXISTS "leads_next_follow_up_at_idx" ON "leads"("next_follow_up_at");
