import { z } from "zod";
import type { IntakeConfig } from "@legalroute/backend/db/schema";
import type { ChatTurn } from "../../llm/types.ts";
import { generateStructured } from "../../llm/structured.ts";
import { intakeConfigSchema, editableConfigSchema, normalizeConfig } from "@legalroute/backend/services/intake-config";
import type { ResolvedSettings } from "@legalroute/backend/contracts/ai";

const builderTurnSchema = z.object({
  reply: z.string().describe("Short chat reply to the attorney summarizing what you changed, or answering their question."),
  changed: z.boolean().describe("True if you changed the intake form in this turn."),
  config: intakeConfigSchema.describe("The complete intake form after your changes (unchanged if changed is false)."),
});

function systemPrompt(templateName: string, practiceArea: string | null, config: IntakeConfig) {
  return `You are Maya, LegalRoute's assistant for law firms. You are helping an attorney build the intake form "${templateName}"${
    practiceArea ? ` for ${practiceArea}` : ""
  }. Clients answer this form by talking with a voice assistant, which asks the questions conversationally.

The current form, as JSON:
${JSON.stringify(config, null, 2)}

How to work:
- Make exactly the changes the attorney asks for: add, remove, reword, reorder, or move questions and sections. Keep everything else as it is, including existing ids, field type, required flag and choices. Return null metadata for legacy questions that have none. Supported types are text, textarea, email, phone, number, date, boolean, select and multiselect. Choice questions need distinct nonempty choices.
- Write questions the way they would be asked aloud: plain, friendly, one thing per question, no legal jargon.
- Give new sections and questions short snake_case ids that are unique across the form.
- If the request is unclear, ask one short clarifying question and set changed to false.
- If they ask for suggestions, propose them in your reply and only add them when asked.
- Keep replies brief: say what you changed (for example "I added 3 questions to Lost Wages.") and offer one useful next step. No markdown headings.
- You build intake forms only; you do not give legal advice.`;
}

export async function builderTurn(opts: {
  templateName: string;
  practiceArea: string | null;
  config: IntakeConfig;
  history: ChatTurn[];
  settings: ResolvedSettings;
}) {
  const result = await generateStructured({
    system: systemPrompt(opts.templateName, opts.practiceArea, opts.config),
    messages: opts.history,
    schema: builderTurnSchema,
    name: "intake_builder_turn",
    settings: opts.settings,
  });
  const config = result.changed ? normalizeConfig(result.config) : opts.config;
  if (result.changed) editableConfigSchema.parse(config);
  return { reply: result.reply, changed: result.changed && config.sections.length > 0, config };
}
