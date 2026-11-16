CREATE TABLE "test_folder_access_grants" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"folder_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"access_level" text NOT NULL,
	"granted_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_folders" ADD COLUMN "owner_id" varchar(36);--> statement-breakpoint
ALTER TABLE "test_folder_access_grants" ADD CONSTRAINT "test_folder_access_grants_folder_id_test_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."test_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "test_folder_access_grants_work_idx" ON "test_folder_access_grants" USING btree ("folder_id","user_id") WHERE "test_folder_access_grants"."access_level" <> 'review';--> statement-breakpoint
CREATE UNIQUE INDEX "test_folder_access_grants_review_idx" ON "test_folder_access_grants" USING btree ("folder_id","user_id") WHERE "test_folder_access_grants"."access_level" = 'review';--> statement-breakpoint
UPDATE "test_folders" SET "owner_id" = "created_by" WHERE "owner_id" IS NULL AND "created_by" IS NOT NULL;