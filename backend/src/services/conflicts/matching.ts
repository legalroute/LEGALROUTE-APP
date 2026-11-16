import { z } from "zod";
import type { ConflictCandidate, ConflictMatch, ConflictSubject } from "../../db/schema.ts";
export class ConflictError extends Error {}
export const subjectSchema = z.object({ name: z.string().trim().min(2).max(200).refine((v) => normalizeName(v).length >= 2, "Enter a meaningful party name"), role: z.enum(["client", "opposing"]), aliases: z.array(z.string().trim().min(2).max(200)).max(20).optional(), email: z.union([z.email(), z.literal("")]).optional() });
export const checkInput = z.object({ intakeId: z.string().uuid().optional(), subjects: z.array(subjectSchema).min(1).max(30), opposingComplete: z.boolean() });
export const mappingSchema = z.object({ name: z.string().min(1).max(100), role: z.string().min(1).max(100), aliases: z.string().max(100).optional(), matter: z.string().max(100).optional(), attorney: z.string().max(100).optional(), status: z.string().max(100).optional(), email: z.string().max(100).optional() });
export function normalizeName(name: string) {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
const sorted = (name: string) => name.split(" ").sort().join(" ");
function withinOneEdit(a: string, b: string) {
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function matchParty(subject: ConflictSubject, candidate: ConflictCandidate): string | undefined {
  if (subject.email && candidate.email && subject.email.toLowerCase() === candidate.email.toLowerCase()) return "Same email address";
  for (const left of [subject.name, ...(subject.aliases ?? [])]) for (const right of [candidate.name, ...candidate.aliases]) {
    const a = normalizeName(left), b = normalizeName(right);
    if (!a || !b) continue;
    if (a === b) return left === subject.name && right === candidate.name ? "Same normalized name" : "Name or alias match";
    if (sorted(a) === sorted(b)) return "Same name tokens in a different order";
    if (a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 1 && withinOneEdit(a, b)) return "Possible spelling variation";
  }
}
export function findMatches(subjects: ConflictSubject[], candidates: ConflictCandidate[]) {
  const matches: ConflictMatch[] = [];
  let truncated = false;
  for (const subject of subjects) for (const candidate of candidates) {
    const reason = matchParty(subject, candidate);
    if (reason) {
      if (matches.length >= 200) { truncated = true; break; }
      matches.push({ subject: subject.name, subjectRole: subject.role, candidate, reason });
    }
  }
  return { matches, truncated };
}
