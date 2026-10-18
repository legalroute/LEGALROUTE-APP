import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
});

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
export type IntakeQuestion = { id: string; text: string };
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
  (t) => [index("clients_firm_idx").on(t.lawFirmId, t.createdAt)],
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
  (t) => [index("intake_sessions_firm_idx").on(t.lawFirmId, t.createdAt)],
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
