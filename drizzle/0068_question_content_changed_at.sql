-- PRD-52 (issue 61): when the reviewed content of a question last changed. NULL = unknown (rows edited
-- before this migration); written by the questions repository only. Additive, no backfill.
ALTER TABLE "questions" ADD COLUMN "content_changed_at" timestamp;
