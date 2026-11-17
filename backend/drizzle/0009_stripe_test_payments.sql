CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"law_firm_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"stripe_session_id" text,
	"checkout_url" text,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount_positive" CHECK ("payment_requests"."amount_cents" between 50 and 99999999),
	CONSTRAINT "payment_currency_usd" CHECK ("payment_requests"."currency" = 'usd')
);
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_request_id_payment_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."payment_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_client_id_law_firm_id_clients_id_law_firm_id_fk" FOREIGN KEY ("client_id","law_firm_id") REFERENCES "public"."clients"("id","law_firm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_created_by_law_firm_id_users_id_law_firm_id_fk" FOREIGN KEY ("created_by","law_firm_id") REFERENCES "public"."users"("id","law_firm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_request_key" ON "payment_requests" USING btree ("law_firm_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_stripe_session" ON "payment_requests" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "payment_firm_created" ON "payment_requests" USING btree ("law_firm_id","created_at");