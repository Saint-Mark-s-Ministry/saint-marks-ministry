-- Existing QR links retain their sign-up behavior. Contact-update links cannot
-- create children, change enrollment, or overwrite populated contact fields.
ALTER TABLE "SundaySchoolRosterLink"
ADD COLUMN "contactUpdateOnly" BOOLEAN NOT NULL DEFAULT false;
