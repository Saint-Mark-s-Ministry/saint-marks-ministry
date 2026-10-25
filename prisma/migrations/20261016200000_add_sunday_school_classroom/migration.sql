-- Existing classes have no location until a coordinator sets one.
ALTER TABLE "SundaySchoolClass" ADD COLUMN "classroom" VARCHAR(200);
