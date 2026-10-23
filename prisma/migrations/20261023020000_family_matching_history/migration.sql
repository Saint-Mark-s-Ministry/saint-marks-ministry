ALTER TABLE "SundaySchoolFamily" ADD COLUMN "matchingHistory" JSONB;
ALTER TABLE "SundaySchoolFamily" ADD COLUMN "matchingPhones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SundaySchoolChild" ADD COLUMN "familyDetailsOverrides" JSONB;
