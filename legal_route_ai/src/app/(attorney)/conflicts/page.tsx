import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, datasets, datasetSnapshots, conflictSources, conflictChecks, conflictReviews, intakeSessions, intakeResponses, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { CheckForm, SourceForm, ReviewForm } from "./forms";
export const metadata = { title: "Conflict Checks — LegalRoute" };
export default async function ConflictsPage({ searchParams }: PageProps<"/conflicts">) {
  const user = await requireUser(), params = await searchParams;
  const tables = await db.select({ id: datasets.id, name: datasets.name, columns: datasetSnapshots.columns, mapping: conflictSources.mapping }).from(datasets)
    .innerJoin(datasetSnapshots, and(eq(datasetSnapshots.datasetId, datasets.id), eq(datasetSnapshots.lawFirmId, user.firm.id), eq(datasetSnapshots.active, true)))
    .leftJoin(conflictSources, and(eq(conflictSources.datasetId, datasets.id), eq(conflictSources.lawFirmId, user.firm.id))).where(eq(datasets.lawFirmId, user.firm.id));
  const checks = await db.select().from(conflictChecks).where(eq(conflictChecks.lawFirmId, user.firm.id)).orderBy(desc(conflictChecks.createdAt), desc(conflictChecks.id)).limit(30);
  const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const selected = uuid(params.check) ? (await db.select().from(conflictChecks).where(and(eq(conflictChecks.id, params.check), eq(conflictChecks.lawFirmId, user.firm.id))))[0] : undefined;
  const session = uuid(params.intake) ? (await db.select().from(intakeSessions).where(and(eq(intakeSessions.id, params.intake), eq(intakeSessions.lawFirmId, user.firm.id))))[0] : undefined;
  const answers = session ? await db.select().from(intakeResponses).where(eq(intakeResponses.sessionId, session.id)) : [];
  const clientName = session?.clientName ?? answers.find((a) => ["full_name", "client_name", "name"].includes(a.questionId))?.value ?? "";
  const reviews = selected ? await db.select({ review: conflictReviews, name: users.name, email: users.email }).from(conflictReviews).innerJoin(users, and(eq(users.id, conflictReviews.reviewerId), eq(users.lawFirmId, user.firm.id))).where(and(eq(conflictReviews.checkId, selected.id), eq(conflictReviews.lawFirmId, user.firm.id))).orderBy(desc(conflictReviews.createdAt), desc(conflictReviews.id)) : [];
  return <div className="mx-auto max-w-6xl space-y-5"><PageHeader title="Conflict Checks" subtitle="Check prospective clients and opposing parties against your firm's mapped registry and existing clients. An attorney must review before intake approval." />
    {params.error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">Intake approval requires a current, complete conflict check and attorney clearance. Review the latest check, refresh sources if needed, and run a new intake-linked check.</p>}
    <div className="grid gap-5 lg:grid-cols-2"><Card className="space-y-4 p-5"><h2 className="text-xl font-semibold">{session ? `Check intake: ${clientName || "Unnamed client"}` : "New manual check"}</h2>{session && <Link className="text-orange-700" href={`/intakes/${session.id}`}>Back to intake</Link>}<CheckForm intakeId={session?.id} client={clientName} email={session?.clientEmail ?? ""} key={session?.id ?? "manual"} /></Card>
      {["attorney", "admin"].includes(user.role) && <Card className="space-y-4 p-5"><h2 className="text-xl font-semibold">Party registry sources</h2><SourceForm tables={tables.map((t) => ({ ...t, mapping: t.mapping ?? undefined }))} /></Card>}</div>
    {selected && <Card className="p-5"><h2 className="text-xl font-semibold">Result: {selected.status.replaceAll("_", " ")}</h2><p className="my-2 text-sm text-slate-500">Checked {selected.createdAt.toISOString()} · {selected.subjects.map((s) => `${s.name} (${s.role})`).join("; ")}</p>{selected.intakeId && <Link href={`/intakes/${selected.intakeId}`} className={buttonClass.secondary}>Open linked intake</Link>}
      {selected.intakeId && <Link href={`/conflicts?intake=${selected.intakeId}`} className={`${buttonClass.secondary} ml-2`}>Run a new check for this intake</Link>}
      {selected.issues.map((issue, i) => <p key={i} className="my-2 text-sm text-red-700">{issue}</p>)}
      {!selected.matches.length && <p className="my-3 text-sm">No matches in the checked records. This does not establish absence of conflicts.</p>}
      <div className="my-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Entered party", "Matched record", "Role / status", "Matter / attorney", "Source", "Reason"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{selected.matches.map((m, i) => <tr key={i} className="border-t"><td className="p-2">{m.subject} ({m.subjectRole})</td><td className="p-2">{m.candidate.name}</td><td className="p-2">{m.candidate.role} / {m.candidate.status || "unspecified"}</td><td className="p-2">{m.candidate.matter || "unspecified"} / {m.candidate.attorney || "unspecified"}</td><td className="p-2">{m.candidate.source}</td><td className="p-2">{m.reason}</td></tr>)}</tbody></table></div>
      <h3 className="font-semibold">Review history</h3>{reviews.length ? reviews.map(({ review, name, email }) => <div key={review.id} className="my-2 rounded-lg bg-slate-50 p-3 text-sm"><strong>{review.decision}</strong> · {name || email} · {review.createdAt.toISOString()}<p className="whitespace-pre-wrap">{review.notes}</p></div>) : <p className="text-sm text-slate-500">No attorney decision recorded.</p>}{user.role === "attorney" && <ReviewForm id={selected.id} incomplete={selected.status === "incomplete"} />}</Card>}
    <Card className="p-5"><h2 className="mb-3 text-xl font-semibold">Recent checks</h2>{checks.map((c) => <Link key={c.id} href={`/conflicts?check=${c.id}`} className="block border-t py-3 text-sm text-orange-700">{c.subjects.map((s) => s.name).join(" / ")} — {c.status.replaceAll("_", " ")} · {c.createdAt.toISOString()}</Link>)}{!checks.length && <p>No checks yet.</p>}</Card>
  </div>;
}
