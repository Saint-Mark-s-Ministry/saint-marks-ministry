-- Class-scoped memorization items with per-child scores (0-100).
CREATE TABLE "SundaySchoolMemorization" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "dueDate" DATE,
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SundaySchoolMemorization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SundaySchoolMemorizationScore" (
    "id" TEXT NOT NULL,
    "memorizationId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SundaySchoolMemorizationScore_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SundaySchoolMemorizationScore_score_range" CHECK ("score" >= 0 AND "score" <= 100)
);

CREATE INDEX "SundaySchoolMemorization_classId_archivedAt_idx" ON "SundaySchoolMemorization"("classId", "archivedAt");
CREATE INDEX "SundaySchoolMemorization_createdById_idx" ON "SundaySchoolMemorization"("createdById");
CREATE UNIQUE INDEX "SundaySchoolMemorizationScore_memorizationId_childId_key" ON "SundaySchoolMemorizationScore"("memorizationId", "childId");
CREATE INDEX "SundaySchoolMemorizationScore_childId_idx" ON "SundaySchoolMemorizationScore"("childId");
CREATE INDEX "SundaySchoolMemorizationScore_recordedById_idx" ON "SundaySchoolMemorizationScore"("recordedById");

ALTER TABLE "SundaySchoolMemorization" ADD CONSTRAINT "SundaySchoolMemorization_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SundaySchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolMemorization" ADD CONSTRAINT "SundaySchoolMemorization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolMemorizationScore" ADD CONSTRAINT "SundaySchoolMemorizationScore_memorizationId_fkey" FOREIGN KEY ("memorizationId") REFERENCES "SundaySchoolMemorization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolMemorizationScore" ADD CONSTRAINT "SundaySchoolMemorizationScore_childId_fkey" FOREIGN KEY ("childId") REFERENCES "SundaySchoolChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SundaySchoolMemorizationScore" ADD CONSTRAINT "SundaySchoolMemorizationScore_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
