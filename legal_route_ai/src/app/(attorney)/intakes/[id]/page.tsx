import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, CircleAlert, UserPlus, X } from "lucide-react";
import { db, intakeResponses, intakeSessions, voiceConversations, voiceMessages } from "@/db";
import { Avatar, Card, CardHeader, EmptyState, Pill, buttonClass, intakeStatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime, initials } from "@/lib/format";
import { INTAKE_TOPICS } from "@/lib/intake";
import { questionCount } from "@/lib/intake-config";
import { acceptIntake, declineIntake, markReviewed } from "../actions";
import { RequestInfoForm } from "./request-info-form";

export const metadata: Metadata = { title: "Intake — LegalRoute" };

export default async function IntakeDetailPage({ params }: PageProps<"/intakes/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const [session] = await db
    .select()
    .from(intakeSessions)
    .where(and(eq(intakeSessions.id, id), eq(intakeSessions.lawFirmId, user.firm.id)))
    .catch(() => []);
  if (!session) notFound();

  const [responses, conversation, transcript] = await Promise.all([
    db.select().from(intakeResponses).where(eq(intakeResponses.sessionId, session.id)),
    session.voiceConversationId
      ? db.select().from(voiceConversations).where(eq(voiceConversations.id, session.voiceConversationId)).then((r) => r[0])
      : null,
    session.voiceConversationId
      ? db.select().from(voiceMessages).where(eq(voiceMessages.conversationId, session.voiceConversationId)).orderBy(asc(voiceMessages.createdAt))
      : [],
  ]);
  const answers = new Map(responses.map((r) => [r.questionId, r.value]));
  const status = intakeStatusBadge(session.status, session.createdAt);
  const open = !["completed", "declined"].includes(session.status);
  const total = session.config ? questionCount(session.config) : INTAKE_TOPICS.length;
  const answeredCount = session.config ? responses.length : (conversation?.coveredTopics.length ?? 0);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/intakes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft className="size-4" aria-hidden /> All intakes
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar text={initials(session.clientName, "?")} size="lg" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-3xl font-semibold">{session.clientName ?? "Unnamed client"}</h1>
            <Pill tone={status.tone}>{status.label}</Pill>
          </div>
          <p className="text-sm text-slate-500">
            {[session.matterType, session.clientEmail, session.submittedAt ? `Submitted ${formatDateTime(session.submittedAt)}` : `Started ${formatDateTime(session.createdAt)}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {session.clientId && (
          <Link href={`/clients/${session.clientId}`} className={buttonClass.secondary}>
            Open client workspace
          </Link>
        )}
      </div>

      {session.endedEarly && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          The client chose to stop before every question was answered ({answeredCount} of {total} answered).
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Answers" actions={<span className="text-sm text-slate-500">{answeredCount} of {total} answered</span>} />
            {session.config ? (
              <div className="divide-y divide-slate-100">
                {session.config.sections.map((section) => (
                  <div key={section.id} className="px-5 py-4">
                    <h3 className="mb-2 text-sm font-semibold text-slate-800">{section.title}</h3>
                    <dl className="grid gap-2">
                      {section.questions.map((q) => (
                        <div key={q.id} className="grid gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                          <dt className="text-sm text-slate-500">{q.text}</dt>
                          <dd className={`text-sm ${answers.has(q.id) ? "text-slate-900" : "text-slate-300 italic"}`}>{answers.get(q.id) ?? "Not answered"}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-4">
                <p className="mb-3 text-sm text-slate-500">This intake came from the original voice page, which tracks topics rather than individual answers. See the transcript for details.</p>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {INTAKE_TOPICS.map((t) => {
                    const covered = conversation?.coveredTopics.includes(t.id);
                    return (
                      <li key={t.id} className={`flex items-center gap-2 text-sm ${covered ? "text-slate-800" : "text-slate-400"}`}>
                        {covered ? <Check className="size-4 text-green-600" aria-hidden /> : <X className="size-4" aria-hidden />}
                        {t.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Transcript" />
            {transcript.length === 0 ? (
              <EmptyState>No transcript recorded.</EmptyState>
            ) : (
              <ol className="flex flex-col gap-3 p-5">
                {transcript.map((m) => (
                  <li key={m.id} className={`flex gap-3 ${m.role === "client" ? "" : ""}`}>
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                        m.role === "client" ? "bg-slate-100 text-slate-700" : "bg-orange-100 text-orange-800"
                      }`}
                    >
                      {m.role === "client" ? initials(session.clientName, "C") : session.templateId ? "M" : "S"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-600">{m.role === "client" ? (session.clientName ?? "Client") : session.templateId ? "Maya" : "Scribe"}</span> ·{" "}
                        {formatDateTime(m.createdAt)}
                      </p>
                      <p className="text-sm leading-relaxed text-slate-800">{m.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <h2 className="mb-1 font-semibold">Next steps</h2>
            <p className="mb-4 text-sm text-slate-500">
              {session.status === "in_progress" ? "The client hasn't finished this intake yet." : "Accept to create a client workspace, or follow up."}
            </p>
            <div className="flex flex-col gap-2">
              {!session.clientId && session.status !== "declined" && (
                <div className="space-y-2"><Link href={`/conflicts?intake=${session.id}`} className={`${buttonClass.secondary} w-full`}>Run conflict check</Link><p className="text-xs text-slate-500">Acceptance requires a current, complete check and attorney clearance. Only an attorney can convert this intake.</p><form action={acceptIntake.bind(null, session.id)}>
                  <button type="submit" disabled={user.role !== "attorney"} className={`${buttonClass.primary} w-full`}>
                    <UserPlus className="size-4" aria-hidden /> Accept &amp; convert to client
                  </button>
                </form></div>
              )}
              {open && session.status !== "reviewed" && session.status !== "in_progress" && (
                <form action={markReviewed.bind(null, session.id)}>
                  <button type="submit" className={`${buttonClass.secondary} w-full`}>
                    <Check className="size-4" aria-hidden /> Mark as reviewed
                  </button>
                </form>
              )}
              {open && (
                <form action={declineIntake.bind(null, session.id)}>
                  <button type="submit" className="w-full rounded-xl px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                    Decline
                  </button>
                </form>
              )}
            </div>
          </Card>
          {open && session.status !== "in_progress" && (
            <Card className="p-5">
              <h2 className="mb-1 font-semibold">Request more info</h2>
              <p className="mb-3 text-sm text-slate-500">Ask the client for missing details or documents.</p>
              <RequestInfoForm sessionId={session.id} clientName={session.clientName} firmName={user.firm.name} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
