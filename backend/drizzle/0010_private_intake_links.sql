CREATE TABLE "intake_access" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"law_firm_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_access_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "intake_access" ADD CONSTRAINT "intake_access_session_id_law_firm_id_intake_sessions_id_law_firm_id_fk" FOREIGN KEY ("session_id","law_firm_id") REFERENCES "public"."intake_sessions"("id","law_firm_id") ON DELETE cascade ON UPDATE no action;