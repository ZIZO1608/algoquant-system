-- AlterTable: evaluation_tokens — store public token for re-shareable magic links
ALTER TABLE "evaluation_tokens" ADD COLUMN "token" TEXT;
UPDATE "evaluation_tokens" SET "token" = encode(gen_random_bytes(24), 'hex') WHERE "token" IS NULL;
ALTER TABLE "evaluation_tokens" ALTER COLUMN "token" SET NOT NULL;
CREATE UNIQUE INDEX "evaluation_tokens_token_key" ON "evaluation_tokens"("token");
ALTER TABLE "evaluation_tokens" DROP CONSTRAINT IF EXISTS "evaluation_tokens_token_hash_key";
DROP INDEX IF EXISTS "evaluation_tokens_token_hash_key";
ALTER TABLE "evaluation_tokens" DROP COLUMN "token_hash";

-- AlterTable: evaluations — full end-of-course rating fields
ALTER TABLE "evaluations" ADD COLUMN "hall_score" INTEGER;
ALTER TABLE "evaluations" ADD COLUMN "recommended_courses" TEXT;
ALTER TABLE "evaluations" ADD COLUMN "benefit_level" INTEGER;
ALTER TABLE "evaluations" ADD COLUMN "benefit_reason" TEXT;

UPDATE "evaluations" SET "hall_score" = 5 WHERE "hall_score" IS NULL;
UPDATE "evaluations" SET "benefit_level" = 5 WHERE "benefit_level" IS NULL;

ALTER TABLE "evaluations" ALTER COLUMN "hall_score" SET NOT NULL;
ALTER TABLE "evaluations" ALTER COLUMN "benefit_level" SET NOT NULL;
