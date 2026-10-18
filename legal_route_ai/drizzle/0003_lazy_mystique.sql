CREATE TYPE "public"."voice_end_reason" AS ENUM('completed', 'client_ended');--> statement-breakpoint
ALTER TABLE "voice_conversations" ADD COLUMN "end_reason" "voice_end_reason";