CREATE TABLE "connector_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"law_firm_id" uuid NOT NULL,
	"connected_by_user_id" uuid NOT NULL,
	"provider" text DEFAULT 'google_sheets' NOT NULL,
	"provider_account_id" text NOT NULL,
	"account_email" text NOT NULL,
	"scopes" text[] NOT NULL,
	"encrypted_credentials" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_connection_status" CHECK ("connector_connections"."status" in ('connected','disconnected'))
);
--> statement-breakpoint
CREATE TABLE "connector_oauth_states" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_verifier" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"law_firm_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"row_count" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "connector_run_status" CHECK ("connector_runs"."status" in ('running','succeeded','failed'))
);
--> statement-breakpoint
CREATE TABLE "dataset_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"law_firm_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"values" jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "dataset_row_positive_position" CHECK ("dataset_rows"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "dataset_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"law_firm_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"schema_hash" text NOT NULL,
	"columns" jsonb NOT NULL,
	"row_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshot_row_count" CHECK ("dataset_snapshots"."row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"law_firm_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"spreadsheet_id" text NOT NULL,
	"sheet_id" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source_title" text NOT NULL,
	"sheet_title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_name_present" CHECK (length(trim("datasets"."name")) between 1 and 150)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "connector_connection_id_firm" ON "connector_connections" USING btree ("id","law_firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_connection_account" ON "connector_connections" USING btree ("law_firm_id","connected_by_user_id","provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_one_running_refresh" ON "connector_runs" USING btree ("dataset_id") WHERE "connector_runs"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_row_position" ON "dataset_rows" USING btree ("snapshot_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_id_firm" ON "dataset_snapshots" USING btree ("id","law_firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_one_active_snapshot" ON "dataset_snapshots" USING btree ("dataset_id") WHERE "dataset_snapshots"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_id_firm" ON "datasets" USING btree ("id","law_firm_id");--> statement-breakpoint
ALTER TABLE "connector_connections" ADD CONSTRAINT "connector_connections_law_firm_id_law_firms_id_fk" FOREIGN KEY ("law_firm_id") REFERENCES "public"."law_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_connections" ADD CONSTRAINT "connector_connections_connected_by_user_id_law_firm_id_users_id_law_firm_id_fk" FOREIGN KEY ("connected_by_user_id","law_firm_id") REFERENCES "public"."users"("id","law_firm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_oauth_states" ADD CONSTRAINT "connector_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_runs" ADD CONSTRAINT "connector_runs_dataset_id_law_firm_id_datasets_id_law_firm_id_fk" FOREIGN KEY ("dataset_id","law_firm_id") REFERENCES "public"."datasets"("id","law_firm_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_rows" ADD CONSTRAINT "dataset_rows_snapshot_id_law_firm_id_dataset_snapshots_id_law_firm_id_fk" FOREIGN KEY ("snapshot_id","law_firm_id") REFERENCES "public"."dataset_snapshots"("id","law_firm_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_snapshots" ADD CONSTRAINT "dataset_snapshots_dataset_id_law_firm_id_datasets_id_law_firm_id_fk" FOREIGN KEY ("dataset_id","law_firm_id") REFERENCES "public"."datasets"("id","law_firm_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_connection_id_law_firm_id_connector_connections_id_law_firm_id_fk" FOREIGN KEY ("connection_id","law_firm_id") REFERENCES "public"."connector_connections"("id","law_firm_id") ON DELETE no action ON UPDATE no action;
