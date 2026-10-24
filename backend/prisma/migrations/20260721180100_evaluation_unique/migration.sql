-- CreateIndex
CREATE UNIQUE INDEX "evaluations_campaign_id_student_id_key" ON "evaluations"("campaign_id", "student_id");
