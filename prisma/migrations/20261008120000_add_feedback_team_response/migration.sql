ALTER TABLE "SundaySchoolFeedbackIdea"
ADD COLUMN "teamResponse" TEXT,
ADD COLUMN "teamRespondedAt" TIMESTAMPTZ(3),
ADD COLUMN "teamRespondedById" TEXT;

ALTER TABLE "SundaySchoolFeedbackIdea"
ADD CONSTRAINT "SundaySchoolFeedbackIdea_teamRespondedById_fkey"
FOREIGN KEY ("teamRespondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
