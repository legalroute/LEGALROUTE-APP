CREATE TYPE "public"."llm_provider" AS ENUM('anthropic', 'openai');--> statement-breakpoint
CREATE TYPE "public"."voice_role" AS ENUM('client', 'scribe');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"llm_provider" "llm_provider" DEFAULT 'anthropic' NOT NULL,
	"openai_model" text,
	"firm_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"client_name" text,
	"covered_topics" text[] DEFAULT '{}' NOT NULL,
	"completed_at" timestamp with time zone,
	"matter_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "voice_role" NOT NULL,
	"text" text NOT NULL,
	"provider" "llm_provider",
	"model" text,
	"audio_path" text,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_conversations" ADD CONSTRAINT "voice_conversations_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_messages" ADD CONSTRAINT "voice_messages_conversation_id_voice_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."voice_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_messages_conversation_idx" ON "voice_messages" USING btree ("conversation_id","created_at");