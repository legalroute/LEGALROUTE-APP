import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { FilePenLine, Link2 } from "lucide-react";
import { db, intakeTemplates } from "@/db";
import { Card, PageHeader, Pill, buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { questionCount } from "@/lib/intake-config";
import { setDefaultTemplate } from "./actions";
import { NewTemplateForm } from "./new-template-form";

export const metadata: Metadata = { title: "Intake Builder — LegalRoute" };

export default async function IntakeBuilderPage() {
  const user = await requireUser();
  const templates = await db
    .select()
    .from(intakeTemplates)
    .where(eq(intakeTemplates.lawFirmId, user.firm.id))
    .orderBy(desc(intakeTemplates.updatedAt));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Intake Builder" subtitle="Tell Maya what you need and preview your intake in real time." />
      <Link href="/connections/intake" className={`${buttonClass.secondary} mb-5`}>Generate from Google Sheets / Excel / CSV</Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-4 sm:grid-cols-2">
          {templates.map((t) => {
            const isDefault = user.firm.defaultTemplateId === t.id;
            const unpublished = !t.publishedConfig || JSON.stringify(t.publishedConfig) !== JSON.stringify(t.config);
            return (
              <Card key={t.id} className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-orange-50 text-orange-600">
                    <FilePenLine className="size-5" aria-hidden />
                  </span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {isDefault && <Pill tone="blue">Intake link</Pill>}
                    {!t.publishedConfig ? (
                      <Pill>Draft</Pill>
                    ) : unpublished ? (
                      <Pill tone="orange">Unpublished changes</Pill>
                    ) : (
                      <Pill tone="green">Published</Pill>
                    )}
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{t.name}</h2>
                  <p className="text-sm text-slate-500">
                    {[t.practiceArea, `${t.config.sections.length} sections`, `${questionCount(t.config)} questions`].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Updated {timeAgo(t.updatedAt)}</p>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link href={`/intake-builder/${t.id}`} className={buttonClass.primary}>
                    Open builder
                  </Link>
                  {!isDefault && t.publishedConfig && (
                    <form action={setDefaultTemplate.bind(null, t.id)}>
                      <button type="submit" className={buttonClass.secondary}>
                        <Link2 className="size-4" aria-hidden /> Use for intake link
                      </button>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-1 font-semibold">New intake</h2>
          <p className="mb-4 text-sm text-slate-500">Start from the personal injury starter or a blank form, then shape it with Maya.</p>
          <NewTemplateForm />
        </Card>
      </div>
    </div>
  );
}
