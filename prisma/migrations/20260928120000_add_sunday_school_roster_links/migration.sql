-- Temporary, class-scoped Sunday School roster sign-up links (QR codes).
-- Purely additive: one new table plus one nullable column on SundaySchoolChild.

CREATE TABLE "SundaySchoolRosterLink" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sundaySchoolYearId" TEXT NOT NULL,
    -- SHA-256 of the token. The token itself is never stored.
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 40,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMPTZ(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SundaySchoolRosterLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SundaySchoolRosterLink_tokenHash_key"
ON "SundaySchoolRosterLink"("tokenHash");

CREATE INDEX "SundaySchoolRosterLink_classId_revokedAt_idx"
ON "SundaySchoolRosterLink"("classId", "revokedAt");

CREATE INDEX "SundaySchoolRosterLink_createdById_idx"
ON "SundaySchoolRosterLink"("createdById");

CREATE INDEX "SundaySchoolRosterLink_sundaySchoolYearId_idx"
ON "SundaySchoolRosterLink"("sundaySchoolYearId");

ALTER TABLE "SundaySchoolRosterLink"
ADD CONSTRAINT "SundaySchoolRosterLink_classId_sundaySchoolYearId_fkey"
FOREIGN KEY ("classId", "sundaySchoolYearId")
REFERENCES "SundaySchoolClass"("id", "sundaySchoolYearId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SundaySchoolRosterLink"
ADD CONSTRAINT "SundaySchoolRosterLink_sundaySchoolYearId_fkey"
FOREIGN KEY ("sundaySchoolYearId") REFERENCES "SundaySchoolYear"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SundaySchoolRosterLink"
ADD CONSTRAINT "SundaySchoolRosterLink_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Provenance: which sign-up link, if any, put this child on the roster.
ALTER TABLE "SundaySchoolChild" ADD COLUMN "rosterLinkId" TEXT;

CREATE INDEX "SundaySchoolChild_rosterLinkId_idx"
ON "SundaySchoolChild"("rosterLinkId");

ALTER TABLE "SundaySchoolChild"
ADD CONSTRAINT "SundaySchoolChild_rosterLinkId_fkey"
FOREIGN KEY ("rosterLinkId") REFERENCES "SundaySchoolRosterLink"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
