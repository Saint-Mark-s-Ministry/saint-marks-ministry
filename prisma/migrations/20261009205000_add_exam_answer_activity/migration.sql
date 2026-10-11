-- Optional fields preserve all existing activity, attempts, and grades.
ALTER TABLE "DigitalExamEvent"
  ADD COLUMN "questionNumber" INTEGER,
  ADD COLUMN "answerChoice" TEXT;

ALTER TABLE "DigitalExamEvent" ADD CONSTRAINT "DigitalExamEvent_answer_saved_payload_check"
  CHECK ("kind" <> 'ANSWER_SAVED' OR
    ("questionNumber" IS NOT NULL AND "questionNumber" BETWEEN 1 AND 50
      AND "answerChoice" IS NOT NULL AND "answerChoice" IN ('', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')));
