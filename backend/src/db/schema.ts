import { sql } from "drizzle-orm";
import { check, foreignKey, boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const matterStatus = pgEnum("matter_status", ["open", "in_progress", "closed"]);

// A legal matter (case) handled by the firm.
export const matters = pgTable("matters", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  clientName: text("client_name").notNull(),
  practiceArea: text("practice_area"),
  status: matterStatus("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Matter = typeof matters.$inferSelect;
export type NewMatter = typeof matters.$inferInsert;

// ---- Voice intake ----

export const llmProvider = pgEnum("llm_provider", ["anthropic", "openai"]);
export const voiceRole = pgEnum("voice_role", ["client", "scribe"]);
// How an intake finished: every topic covered, or the client chose to stop early.
export const voiceEndReason = pgEnum("voice_end_reason", ["completed", "client_ended"]);

// A spoken intake session between a client and the Scribe assistant.
export const voiceConversations = pgTable("voice_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
  clientName: text("client_name"),
  coveredTopics: text("covered_topics").array().notNull().default([]),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  endReason: voiceEndReason("end_reason"),
  matterId: uuid("matter_id").references(() => matters.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One spoken turn. Scribe turns record which provider/model produced them.
export const voiceMessages = pgTable(
  "voice_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => voiceConversations.id, { onDelete: "cascade" }),
    role: voiceRole("role").notNull(),
    text: text("text").notNull(),
    provider: llmProvider("provider"),
    model: text("model"),
    audioPath: text("audio_path"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("voice_messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

// Single-row app settings (id is always 1).
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  llmProvider: llmProvider("llm_provider").notNull().default("anthropic"),
  openaiModel: text("openai_model"),
  firmName: text("firm_name"),
  // Live conversation: silence (ms) that ends a client turn, and whether speaking interrupts Scribe.
  silenceMs: integer("silence_ms").notNull().default(1200),
  allowInterrupt: boolean("allow_interrupt").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type VoiceConversation = typeof voiceConversations.$inferSelect;
export type VoiceMessage = typeof voiceMessages.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;

// ---- Phase 1: firms, attorneys, intakes, clients ----

export const userRole = pgEnum("user_role", ["attorney", "staff", "admin"]);

// Client-experience and notification preferences, stored as one JSON column.
export type FirmSettings = {
  showProgress?: boolean;
  collectEmailAtStart?: boolean;
  requireESignature?: boolean;
  showThankYou?: boolean;
  thankYouMessage?: string;
  welcomeMessage?: string;
  notifyOnIntake?: boolean;
  notificationEmail?: string;
  theme?: "original" | "mono" | "dark";
};

// A law firm. Everything an attorney sees is scoped to their firm.
export const lawFirms = pgTable("law_firms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Public intake link: /intake/<slug>.
  slug: text("slug").notNull().unique(),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  practiceAreas: text("practice_areas").array().notNull().default([]),
  settings: jsonb("settings").$type<FirmSettings>().notNull().default({}),
  // Template served at the firm's permanent intake link.
  defaultTemplateId: uuid("default_template_id"),
  // The firm that receives intakes from the original /voice page.
  ownsLegacyVoice: boolean("owns_legacy_voice").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: userRole("role").notNull().default("attorney"),
  lawFirmId: uuid("law_firm_id")
    .notNull()
    .references(() => lawFirms.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("users_id_firm_idx").on(t.id, t.lawFirmId)]);

// One-time magic-link tokens. Only a SHA-256 hash of the token is stored.
export const loginTokens = pgTable("login_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Signed-in browser sessions. The cookie holds a random token; the table holds its hash.
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// An intake form: sections of questions. `config` is the working draft; `publishedConfig` is what clients get.
export type IntakeFieldType = "text" | "textarea" | "email" | "phone" | "number" | "date" | "boolean" | "select" | "multiselect";
export type IntakeQuestion = { id: string; text: string; type?: IntakeFieldType | null; required?: boolean | null; choices?: string[] | null };
export type IntakeSection = { id: string; title: string; questions: IntakeQuestion[] };
export type IntakeConfig = { sections: IntakeSection[] };

export const intakeTemplates = pgTable("intake_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  lawFirmId: uuid("law_firm_id")
    .notNull()
    .references(() => lawFirms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  practiceArea: text("practice_area"),
  config: jsonb("config").$type<IntakeConfig>().notNull(),
  publishedConfig: jsonb("published_config").$type<IntakeConfig>(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const clientStatus = pgEnum("client_status", ["lead", "qualified", "active", "closed"]);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lawFirmId: uuid("law_firm_id")
      .notNull()
      .references(() => lawFirms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    matterType: text("matter_type"),
    status: clientStatus("status").notNull().default("lead"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clients_firm_idx").on(t.lawFirmId, t.createdAt), uniqueIndex("clients_id_firm_idx").on(t.id, t.lawFirmId)],
);

export const intakeStatus = pgEnum("intake_status", [
  "in_progress",
  "pending_review",
  "info_requested",
  "reviewed",
  "completed",
  "declined",
]);

// One client's run through an intake. The spoken transcript lives in voice_conversations/voice_messages.
export const intakeSessions = pgTable(
  "intake_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lawFirmId: uuid("law_firm_id")
      .notNull()
      .references(() => lawFirms.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => intakeTemplates.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    voiceConversationId: uuid("voice_conversation_id")
      .unique()
      .references(() => voiceConversations.id, { onDelete: "set null" }),
    // Questions frozen at start, so later template edits don't rewrite history. Null for /voice intakes.
    config: jsonb("config").$type<IntakeConfig>(),
    clientName: text("client_name"),
    clientEmail: text("client_email"),
    matterType: text("matter_type"),
    status: intakeStatus("status").notNull().default("in_progress"),
    endedEarly: boolean("ended_early").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("intake_sessions_firm_idx").on(t.lawFirmId, t.createdAt), uniqueIndex("intake_sessions_id_firm").on(t.id, t.lawFirmId)],
);

export const intakeResponses = pgTable(
  "intake_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => intakeSessions.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    questionText: text("question_text").notNull(),
    value: text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("intake_responses_question_idx").on(t.sessionId, t.questionId)],
);

export const documentStatus = pgEnum("document_status", ["requested", "received"]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lawFirmId: uuid("law_firm_id")
      .notNull()
      .references(() => lawFirms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => intakeSessions.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: documentStatus("status").notNull().default("received"),
    // Path under uploads/ (gitignored); null while a document is only requested.
    filePath: text("file_path"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_client_idx").on(t.clientId, t.createdAt)],
);

export const taskStatus = pgEnum("task_status", ["open", "done"]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lawFirmId: uuid("law_firm_id")
      .notNull()
      .references(() => lawFirms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: taskStatus("status").notNull().default("open"),
    dueDate: date("due_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_client_idx").on(t.clientId, t.createdAt)],
);

export const calendarProvider = pgEnum("calendar_provider", ["google", "calendly", "apple"]);

export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: calendarProvider("provider").notNull(),
    accountEmail: text("account_email"),
    // Calendly: the attorney's public booking page.
    schedulingUrl: text("scheduling_url"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("calendar_connections_user_provider_idx").on(t.userId, t.provider)],
);

// Timeline entries for the Home feed and a client's Activity tab.
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lawFirmId: uuid("law_firm_id")
      .notNull()
      .references(() => lawFirms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_firm_idx").on(t.lawFirmId, t.createdAt)],
);

export const mayaScope = pgEnum("maya_scope", ["home", "client", "template"]);
export const chatRole = pgEnum("chat_role", ["user", "assistant"]);

// Attorney chats with Maya: on Home, about one client, or while building an intake template.
export const mayaMessages = pgTable(
  "maya_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lawFirmId: uuid("law_firm_id")
      .notNull()
      .references(() => lawFirms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    scope: mayaScope("scope").notNull(),
    // Client id or template id; null for Home.
    scopeId: uuid("scope_id"),
    role: chatRole("role").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("maya_messages_scope_idx").on(t.lawFirmId, t.scope, t.scopeId, t.createdAt)],
);

export type LawFirm = typeof lawFirms.$inferSelect;
export type User = typeof users.$inferSelect;
export type IntakeTemplate = typeof intakeTemplates.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type IntakeSession = typeof intakeSessions.$inferSelect;
export type IntakeResponse = typeof intakeResponses.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type MayaMessage = typeof mayaMessages.$inferSelect;


// Native scheduling is independent of external calendar providers.
export const appointmentStatus = pgEnum("appointment_status", ["scheduled", "cancelled"]);
export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  lawFirmId: uuid("law_firm_id").notNull().references(() => lawFirms.id, { onDelete: "cascade" }),
  organizerId: uuid("organizer_id").notNull(),
  clientId: uuid("client_id"),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timeZone: text("time_zone").notNull(),
  location: text("location").notNull().default(""),
  notes: text("notes").notNull().default(""),
  status: appointmentStatus("status").notNull().default("scheduled"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("appointments_time_order", sql`${t.endsAt} > ${t.startsAt}`),
  check("appointments_title_present", sql`length(trim(${t.title})) > 0`),
  index("appointments_organizer_time_idx").on(t.organizerId, t.startsAt),
  index("appointments_firm_time_idx").on(t.lawFirmId, t.startsAt),
  foreignKey({ columns: [t.organizerId, t.lawFirmId], foreignColumns: [users.id, users.lawFirmId] }),
  foreignKey({ columns: [t.clientId, t.lawFirmId], foreignColumns: [clients.id, clients.lawFirmId] }),
]);

export const appointmentAttendees = pgTable("appointment_attendees", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
}, (t) => [uniqueIndex("appointment_attendees_email_idx").on(t.appointmentId, t.email)]);

export type Appointment = typeof appointments.$inferSelect;

// Firm-owned connector accounts and read-only dataset snapshots.
export const connectorConnections = pgTable("connector_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  lawFirmId: uuid("law_firm_id").notNull().references(() => lawFirms.id, { onDelete: "cascade" }),
  connectedByUserId: uuid("connected_by_user_id").notNull(),
  provider: text("provider").notNull().default("google_sheets"),
  providerAccountId: text("provider_account_id").notNull(),
  accountEmail: text("account_email").notNull(),
  scopes: text("scopes").array().notNull(),
  encryptedCredentials: text("encrypted_credentials"),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("connected"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("connector_connection_id_firm").on(t.id, t.lawFirmId),
  uniqueIndex("connector_connection_account").on(t.lawFirmId, t.connectedByUserId, t.provider, t.providerAccountId),
  foreignKey({ columns: [t.connectedByUserId, t.lawFirmId], foreignColumns: [users.id, users.lawFirmId] }),
  check("connector_connection_status", sql`${t.status} in ('connected','disconnected')`),
]);
export const connectorOAuthStates = pgTable("connector_oauth_states", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  encryptedVerifier: text("encrypted_verifier").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const datasets = pgTable("datasets", {
  id: uuid("id").primaryKey().defaultRandom(),
  lawFirmId: uuid("law_firm_id").notNull(),
  connectionId: uuid("connection_id").notNull(),
  name: text("name").notNull(),
  spreadsheetId: text("spreadsheet_id").notNull(),
  sheetId: integer("sheet_id").notNull(),
  version: integer("version").notNull().default(1),
  sourceTitle: text("source_title").notNull(),
  sheetTitle: text("sheet_title").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("dataset_id_firm").on(t.id, t.lawFirmId),
  foreignKey({ columns: [t.connectionId, t.lawFirmId], foreignColumns: [connectorConnections.id, connectorConnections.lawFirmId] }),
  check("dataset_name_present", sql`length(trim(${t.name})) between 1 and 150`),
]);
export type DatasetColumn = { id: string; header: string; label: string; type: "text" | "number" | "boolean" | "date" };
export type DatasetCell = string | number | boolean | null;
export const datasetSnapshots = pgTable("dataset_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  lawFirmId: uuid("law_firm_id").notNull(),
  datasetId: uuid("dataset_id").notNull(),
  active: boolean("active").notNull().default(true),
  schemaHash: text("schema_hash").notNull(),
  columns: jsonb("columns").$type<DatasetColumn[]>().notNull(),
  rowCount: integer("row_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("snapshot_id_firm").on(t.id, t.lawFirmId),
  uniqueIndex("dataset_one_active_snapshot").on(t.datasetId).where(sql`${t.active} = true`),
  foreignKey({ columns: [t.datasetId, t.lawFirmId], foreignColumns: [datasets.id, datasets.lawFirmId] }).onDelete("cascade"),
  check("snapshot_row_count", sql`${t.rowCount} >= 0`),
]);
export const datasetRows = pgTable("dataset_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  lawFirmId: uuid("law_firm_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  position: integer("position").notNull(),
  raw: jsonb("raw").$type<Record<string, string>>().notNull(),
  values: jsonb("values").$type<Record<string, DatasetCell>>().notNull(),
  errors: jsonb("errors").$type<string[]>().notNull().default([]),
}, (t) => [
  uniqueIndex("dataset_row_position").on(t.snapshotId, t.position),
  foreignKey({ columns: [t.snapshotId, t.lawFirmId], foreignColumns: [datasetSnapshots.id, datasetSnapshots.lawFirmId] }).onDelete("cascade"),
  check("dataset_row_positive_position", sql`${t.position} > 0`),
]);
export const connectorRuns = pgTable("connector_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  lawFirmId: uuid("law_firm_id").notNull(),
  datasetId: uuid("dataset_id").notNull(),
  status: text("status").notNull().default("running"),
  error: text("error"),
  rowCount: integer("row_count"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  foreignKey({ columns: [t.datasetId, t.lawFirmId], foreignColumns: [datasets.id, datasets.lawFirmId] }).onDelete("cascade"),
  uniqueIndex("dataset_one_running_refresh").on(t.datasetId).where(sql`${t.status} = 'running'`),
  check("connector_run_status", sql`${t.status} in ('running','succeeded','failed')`),
]);


// Conflict checks are review aids; a name match is never an automatic legal determination.
export type ConflictMapping = { sourceSchemaHash?: string; name: string; role: string; aliases?: string; matter?: string; attorney?: string; status?: string; email?: string };
export type ConflictSubject = { name: string; role: "client" | "opposing"; aliases?: string[]; email?: string };
export type ConflictCandidate = { id: string; name: string; role: string; aliases: string[]; email: string; matter: string; attorney: string; status: string; source: string };
export type ConflictMatch = { subject: string; subjectRole: string; candidate: ConflictCandidate; reason: string };
export const conflictSources = pgTable("conflict_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  lawFirmId: uuid("law_firm_id").notNull().references(() => lawFirms.id),
  datasetId: uuid("dataset_id").notNull(),
  mapping: jsonb("mapping").$type<ConflictMapping>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("conflict_source_dataset").on(t.lawFirmId, t.datasetId), foreignKey({ columns: [t.datasetId, t.lawFirmId], foreignColumns: [datasets.id, datasets.lawFirmId] })]);
export const conflictChecks = pgTable("conflict_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  lawFirmId: uuid("law_firm_id").notNull().references(() => lawFirms.id),
  intakeId: uuid("intake_id"),
  createdBy: uuid("created_by").notNull(),
  subjects: jsonb("subjects").$type<ConflictSubject[]>().notNull(),
  opposingComplete: boolean("opposing_complete").notNull(),
  fingerprint: text("fingerprint").notNull(),
  intakeFingerprint: text("intake_fingerprint"),
  status: text("status").$type<"incomplete" | "matches" | "no_matches">().notNull(),
  issues: jsonb("issues").$type<string[]>().notNull(),
  matches: jsonb("matches").$type<ConflictMatch[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("conflict_check_id_firm").on(t.id, t.lawFirmId), index("conflict_check_intake").on(t.lawFirmId, t.intakeId, t.createdAt), foreignKey({ columns: [t.intakeId, t.lawFirmId], foreignColumns: [intakeSessions.id, intakeSessions.lawFirmId] }), foreignKey({ columns: [t.createdBy, t.lawFirmId], foreignColumns: [users.id, users.lawFirmId] })]);
export const conflictReviews = pgTable("conflict_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  lawFirmId: uuid("law_firm_id").notNull(),
  checkId: uuid("check_id").notNull(),
  reviewerId: uuid("reviewer_id").notNull(),
  decision: text("decision").$type<"clear" | "hold">().notNull(),
  notes: text("notes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [foreignKey({ columns: [t.checkId, t.lawFirmId], foreignColumns: [conflictChecks.id, conflictChecks.lawFirmId] }), foreignKey({ columns: [t.reviewerId, t.lawFirmId], foreignColumns: [users.id, users.lawFirmId] }), index("conflict_review_check").on(t.checkId, t.createdAt)]);

// Test-mode Stripe Checkout requests; card details remain with Stripe.
export const paymentRequests = pgTable("payment_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  lawFirmId: uuid("law_firm_id").notNull(),
  clientId: uuid("client_id").notNull(),
  createdBy: uuid("created_by").notNull(),
  requestKey: uuid("request_key").notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  status: text("status").$type<"creating" | "pending" | "paid" | "expired" | "failed">().notNull().default("creating"),
  stripeSessionId: text("stripe_session_id"),
  checkoutUrl: text("checkout_url"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("payment_request_key").on(t.lawFirmId, t.requestKey), uniqueIndex("payment_stripe_session").on(t.stripeSessionId), index("payment_firm_created").on(t.lawFirmId, t.createdAt), foreignKey({ columns: [t.clientId, t.lawFirmId], foreignColumns: [clients.id, clients.lawFirmId] }), foreignKey({ columns: [t.createdBy, t.lawFirmId], foreignColumns: [users.id, users.lawFirmId] }), check("payment_amount_positive", sql`${t.amountCents} between 50 and 99999999`), check("payment_currency_usd", sql`${t.currency} = 'usd'`)]);
export const paymentEvents = pgTable("payment_events", {
  id: text("id").primaryKey(),
  requestId: uuid("request_id").notNull().references(() => paymentRequests.id),
  type: text("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
