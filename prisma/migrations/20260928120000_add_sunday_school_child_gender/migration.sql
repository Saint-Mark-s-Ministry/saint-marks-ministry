CREATE TYPE "SundaySchoolChildGender" AS ENUM ('MALE', 'FEMALE');

ALTER TABLE "SundaySchoolChild"
ADD COLUMN "gender" "SundaySchoolChildGender";

ALTER TABLE "ChildRegistrationRequest"
ADD COLUMN "gender" "SundaySchoolChildGender";
