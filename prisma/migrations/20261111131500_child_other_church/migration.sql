-- AlterTable
ALTER TABLE "SundaySchoolChild" ADD COLUMN     "attendsOtherChurch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otherChurchName" VARCHAR(200);

