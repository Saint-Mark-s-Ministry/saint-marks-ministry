# Sunday School memorization

The Memorization workspace lets assigned servants and coordinators create any number of items for their class throughout its ministry year. Priests and super admins can manage every class. Servants Prep roles alone do not grant access. Routes resolve the current database authorization context, including active role tags and year-bound assignments; JWT standing is only a UI hint. Durable year/assignment backfill must be reconciled before rollout, as required by the authorization compatibility workflow.

Items have a required title (120 characters), optional instructions (2000 characters), and optional calendar date (midnight UTC). There is no prescribed list: servants choose verses, prayers, hymns, or other material for their class. Each active child can receive a whole-number score from **0 through 100** and optional notes (500 characters). Blank is not scored; saving a blank score clears the previous score and notes. Zero is a recorded score. The summary uses only scored children currently in the roster; unscored children are not counted as zero. Scores persist on their original class item when a child moves.

Archiving hides an item without deleting its scores. Archived items cannot receive score writes; the API can include archives with `includeArchived=true`. There is no archive browser/restore control or historical-year picker in this first version. The workspace lists active classes in the open ministry year (with the repository’s active academic-year fallback for legacy classes). No guardian contacts are returned, and no parent/student self-service score view or write access is introduced.

## Schema rollout

Apply the additive committed migration `20261026140000_sunday_school_memorization` explicitly under the repository’s reviewed release/backup procedure before releasing the feature. It creates item and score tables, foreign keys, a unique child/item score, and a 0–100 database check constraint. Builds do not apply it. Testing uses only the isolated feedback database and shadow database, never production. Rolling back application code can leave these additive tables in place to preserve scores.
