-- Booking coordinator subscriptions are separate from access/role grants.
ALTER TABLE "User" ADD COLUMN "makeupExamNotifications" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the two recipients already requested before making this configurable.
UPDATE "User" SET "makeupExamNotifications" = true
WHERE id IN ('cmjewco6u0004kw0412nr59ib', 'cmjewabag0002kw04rbwy1qg8');
