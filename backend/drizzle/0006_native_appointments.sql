CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'cancelled');--> statement-breakpoint
CREATE TABLE "appointment_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"law_firm_id" uuid NOT NULL,
	"organizer_id" uuid NOT NULL,
	"client_id" uuid,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_time_order" CHECK ("appointments"."ends_at" > "appointments"."starts_at"),
	CONSTRAINT "appointments_title_present" CHECK (length(trim("appointments"."title")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "clients_id_firm_idx" ON "clients" USING btree ("id","law_firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_id_firm_idx" ON "users" USING btree ("id","law_firm_id");--> statement-breakpoint
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_law_firm_id_law_firms_id_fk" FOREIGN KEY ("law_firm_id") REFERENCES "public"."law_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organizer_id_law_firm_id_users_id_law_firm_id_fk" FOREIGN KEY ("organizer_id","law_firm_id") REFERENCES "public"."users"("id","law_firm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_law_firm_id_clients_id_law_firm_id_fk" FOREIGN KEY ("client_id","law_firm_id") REFERENCES "public"."clients"("id","law_firm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_attendees_email_idx" ON "appointment_attendees" USING btree ("appointment_id","email");--> statement-breakpoint
CREATE INDEX "appointments_organizer_time_idx" ON "appointments" USING btree ("organizer_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_firm_time_idx" ON "appointments" USING btree ("law_firm_id","starts_at");