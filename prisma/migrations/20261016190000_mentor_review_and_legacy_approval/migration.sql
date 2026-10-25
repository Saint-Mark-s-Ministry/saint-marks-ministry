ALTER TABLE "AnnualMentorInformation" ADD COLUMN "reviewedAt" TIMESTAMP(3), ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "StudentEnrollment" ADD COLUMN "approvalFormUrl" TEXT, ADD COLUMN "approvalFormFilename" TEXT;
