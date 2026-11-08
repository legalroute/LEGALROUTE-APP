import { z } from "zod";
import type { IntakeConfig } from "../db/schema.ts";

// Shared between server and browser: shape checks and helpers for intake template configs.

export const intakeConfigSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().describe("Short stable id in snake_case, e.g. lost_wages. Keep existing ids unchanged."),
        title: z.string(),
        questions: z.array(
          z.object({
            id: z.string().describe("Short stable id in snake_case, unique across the whole form. Keep existing ids unchanged."),
            text: z.string().describe("The question as it would be asked aloud to a client."),
          }),
        ),
      }),
    )
    .describe("Every section of the intake, in order."),
});

export function allQuestions(config: IntakeConfig) {
  return config.sections.flatMap((s) => s.questions.map((q) => ({ ...q, sectionId: s.id, sectionTitle: s.title })));
}

export function questionCount(config: IntakeConfig) {
  return config.sections.reduce((n, s) => n + s.questions.length, 0);
}

export function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "item"
  );
}

// Model output can repeat ids or leave them empty; make every section and question id unique.
export function normalizeConfig(config: IntakeConfig): IntakeConfig {
  const seenSections = new Set<string>();
  const seenQuestions = new Set<string>();
  const unique = (base: string, seen: Set<string>) => {
    let id = base;
    for (let i = 2; seen.has(id); i++) id = `${base}_${i}`;
    seen.add(id);
    return id;
  };
  return {
    sections: config.sections
      .filter((s) => s.title.trim())
      .map((s) => ({
        id: unique(slugify(s.id || s.title), seenSections),
        title: s.title.trim(),
        questions: s.questions
          .filter((q) => q.text.trim())
          .map((q) => ({ id: unique(slugify(q.id || q.text), seenQuestions), text: q.text.trim() })),
      })),
  };
}

// Every new firm starts with this, and attorneys reshape it in the Intake Builder.
export const STARTER_PERSONAL_INJURY: IntakeConfig = {
  sections: [
    {
      id: "client_information",
      title: "Client Information",
      questions: [
        { id: "full_name", text: "What is your full name?" },
        { id: "phone", text: "What is the best phone number to reach you?" },
        { id: "email", text: "What is your email address?" },
        { id: "preferred_contact", text: "How do you prefer we contact you: phone, text, or email?" },
      ],
    },
    {
      id: "accident_details",
      title: "Accident Details",
      questions: [
        { id: "what_happened", text: "Can you tell me what happened?" },
        { id: "incident_date", text: "When did the accident happen?" },
        { id: "incident_location", text: "Where did it happen?" },
        { id: "police_report", text: "Was a police or incident report made?" },
        { id: "witnesses", text: "Were there any witnesses, photos, or video of the accident?" },
      ],
    },
    {
      id: "injuries",
      title: "Injuries",
      questions: [
        { id: "injuries_description", text: "What injuries did you suffer?" },
        { id: "medical_treatment", text: "Have you received medical treatment, and where?" },
        { id: "ongoing_treatment", text: "Are you still being treated or in pain today?" },
        { id: "prior_injuries", text: "Have you had any prior injuries to the same parts of your body?" },
      ],
    },
    {
      id: "lost_wages",
      title: "Lost Wages",
      questions: [
        { id: "missed_work", text: "Have you missed any work because of your injuries?" },
        { id: "employer_income", text: "Who is your employer, and roughly what do you earn?" },
        { id: "income_lost", text: "How much income have you lost so far?" },
      ],
    },
    {
      id: "insurance",
      title: "Insurance",
      questions: [
        { id: "own_insurance", text: "What insurance company do you have, if any?" },
        { id: "other_party_insurance", text: "Do you know the other party's insurance company?" },
        { id: "insurer_contact", text: "Has any insurance company contacted you or made an offer?" },
      ],
    },
    {
      id: "documents",
      title: "Documents",
      questions: [
        { id: "medical_records", text: "Do you have any medical records or bills from your treatment?" },
        { id: "other_documents", text: "Do you have photos, the police report, or other documents you can share?" },
      ],
    },
  ],
};
