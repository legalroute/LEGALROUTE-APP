CREATE TABLE "conflict_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"law_firm_id" uuid NOT NULL,
	"intake_id" uuid,
	"created_by" uuid NOT NULL,
	"subjects" jsonb NOT NULL,
	"opposing_complete" boolean NOT NULL,
	"fingerprint" text NOT NULL,
	"intake_fingerprint" text,
	"status" text NOT NULL,
	"issues" jsonb NOT NULL,
	"matches" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conflict_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"law_firm_id" uuid NOT NULL,
	"check_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conflict_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"law_firm_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"mapping" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conflict_check_id_firm" ON "conflict_checks" USING btree ("id","law_firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_sessions_id_firm" ON "intake_sessions" USING btree ("id","law_firm_id");--> statement-breakpoint
ALTER TABLE "conflict_checks" ADD CONSTRAINT "conflict_checks_law_firm_id_law_firms_id_fk" FOREIGN KEY ("law_firm_id") REFERENCES "public"."law_firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_checks" ADD CONSTRAINT "conflict_checks_intake_id_law_firm_id_intake_sessions_id_law_firm_id_fk" FOREIGN KEY ("intake_id","law_firm_id") REFERENCES "public"."intake_sessions"("id","law_firm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_checks" ADD CONSTRAINT "conflict_checks_created_by_law_firm_id_users_id_law_firm_id_fk" FOREIGN KEY ("created_by","law_firm_id") REFERENCES "public"."users"("id","law_firm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_reviews" ADD CONSTRAINT "conflict_reviews_check_id_law_firm_id_conflict_checks_id_law_firm_id_fk" FOREIGN KEY ("check_id","law_firm_id") REFERENCES "public"."conflict_checks"("id","law_firm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_reviews" ADD CONSTRAINT "conflict_reviews_reviewer_id_law_firm_id_users_id_law_firm_id_fk" FOREIGN KEY ("reviewer_id","law_firm_id") REFERENCES "public"."users"("id","law_firm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_sources" ADD CONSTRAINT "conflict_sources_law_firm_id_law_firms_id_fk" FOREIGN KEY ("law_firm_id") REFERENCES "public"."law_firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_sources" ADD CONSTRAINT "conflict_sources_dataset_id_law_firm_id_datasets_id_law_firm_id_fk" FOREIGN KEY ("dataset_id","law_firm_id") REFERENCES "public"."datasets"("id","law_firm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conflict_check_intake" ON "conflict_checks" USING btree ("law_firm_id","intake_id","created_at");--> statement-breakpoint
CREATE INDEX "conflict_review_check" ON "conflict_reviews" USING btree ("check_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conflict_source_dataset" ON "conflict_sources" USING btree ("law_firm_id","dataset_id");