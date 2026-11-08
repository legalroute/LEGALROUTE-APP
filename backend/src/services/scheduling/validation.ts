import { z } from "zod";

export const appointmentInput = z.object({
  id: z.string().uuid().optional(),
  version: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(1, "Enter a title.").max(200),
  clientId: z.string().uuid().optional(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  timeZone: z.string().max(80).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return Boolean(value); } catch { return false; }
  }, "Choose a valid time zone."),
  location: z.string().trim().max(500),
  notes: z.string().trim().max(5000),
  attendees: z.array(z.email().max(320).transform((email) => email.toLowerCase())).max(50),
}).superRefine((value, ctx) => {
  if (new Date(value.endsAt) <= new Date(value.startsAt)) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start." });
  }
  if (value.id && !value.version) ctx.addIssue({ code: "custom", path: ["version"], message: "Reload the appointment before editing." });
});
