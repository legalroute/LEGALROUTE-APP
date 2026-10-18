-- Move single-firm data into the multi-firm model.
-- The existing install becomes one firm that also keeps receiving intakes from /voice.
INSERT INTO "law_firms" ("name", "slug", "practice_areas", "settings", "owns_legacy_voice")
SELECT
  COALESCE(NULLIF(TRIM((SELECT "firm_name" FROM "app_settings" WHERE "id" = 1)), ''), 'My Law Firm'),
  'my-firm',
  ARRAY['Personal Injury'],
  '{"showProgress": true, "collectEmailAtStart": false, "requireESignature": false, "showThankYou": true, "notifyOnIntake": true}'::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM "law_firms" WHERE "owns_legacy_voice");
--> statement-breakpoint
-- Matters become clients of that firm.
INSERT INTO "clients" ("law_firm_id", "name", "matter_type", "status", "notes", "created_at")
SELECT
  (SELECT "id" FROM "law_firms" WHERE "owns_legacy_voice" LIMIT 1),
  m."client_name",
  m."practice_area",
  CASE m."status" WHEN 'closed' THEN 'closed'::client_status ELSE 'active'::client_status END,
  'Migrated from matter: ' || m."title",
  m."created_at"
FROM "matters" m;
--> statement-breakpoint
-- Every voice conversation becomes an intake session; finished ones wait for review.
INSERT INTO "intake_sessions" (
  "law_firm_id", "voice_conversation_id", "client_name", "matter_type", "status", "ended_early", "submitted_at", "created_at"
)
SELECT
  (SELECT "id" FROM "law_firms" WHERE "owns_legacy_voice" LIMIT 1),
  v."id",
  v."client_name",
  'Personal Injury',
  CASE WHEN v."completed_at" IS NOT NULL THEN 'pending_review'::intake_status ELSE 'in_progress'::intake_status END,
  COALESCE(v."end_reason" = 'client_ended', false),
  v."completed_at",
  v."created_at"
FROM "voice_conversations" v
WHERE NOT EXISTS (SELECT 1 FROM "intake_sessions" s WHERE s."voice_conversation_id" = v."id");
