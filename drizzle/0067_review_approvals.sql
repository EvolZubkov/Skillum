CREATE TABLE "test_review_approvals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"test_id" varchar(36) NOT NULL,
	"reviewer_id" varchar(36) NOT NULL,
	"anchor_kind" text NOT NULL,
	"anchor_key" varchar(36) DEFAULT '' NOT NULL,
	"question_id" varchar(36),
	"topic_id" varchar(36),
	"content_page_id" uuid,
	"context_label" text,
	"pinned_content_hash" text,
	"approved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_access_grants" ADD COLUMN "accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "test_review_approvals" ADD CONSTRAINT "test_review_approvals_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "test_review_approvals_unique_idx" ON "test_review_approvals" USING btree ("test_id","reviewer_id","anchor_kind","anchor_key");--> statement-breakpoint
CREATE INDEX "test_review_approvals_test_idx" ON "test_review_approvals" USING btree ("test_id");