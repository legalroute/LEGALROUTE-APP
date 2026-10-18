ALTER TABLE "app_settings" ADD COLUMN "silence_ms" integer DEFAULT 1200 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "allow_interrupt" boolean DEFAULT true NOT NULL;