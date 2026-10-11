-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SUNDAY_SCHOOL_LESSON_REMINDER';

-- AlterTable
ALTER TABLE "SundaySchoolWeeklyLesson" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MobilePushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MobilePushToken_userId_idx" ON "MobilePushToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MobilePushToken_userId_token_key" ON "MobilePushToken"("userId", "token");

-- AddForeignKey
ALTER TABLE "MobilePushToken" ADD CONSTRAINT "MobilePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
