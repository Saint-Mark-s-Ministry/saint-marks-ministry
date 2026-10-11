ALTER TABLE "DigitalExamEvent" ADD COLUMN "destinationPath" TEXT;
ALTER TABLE "DigitalExamEvent" ADD CONSTRAINT "DigitalExamEvent_navigation_payload_check"
  CHECK ("kind" <> 'SITE_NAVIGATION' OR
    ("destinationPath" IS NOT NULL AND LENGTH("destinationPath") <= 200
      AND "destinationPath" ~ '^/(dashboard(/|$)|settings$|privacy$|terms$|login$)'
      AND "destinationPath" !~ '[?#]'));
