CREATE TYPE "CourseType" AS ENUM ('course', 'workshop');

ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "course_type" "CourseType" NOT NULL DEFAULT 'course';

CREATE INDEX IF NOT EXISTS "courses_course_type_idx" ON "courses"("course_type");
