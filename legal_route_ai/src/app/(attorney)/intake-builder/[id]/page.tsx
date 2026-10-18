import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db, intakeTemplates } from "@/db";
import { requireUser } from "@/lib/auth";
import { initials } from "@/lib/format";
import { loadChat, toChatDto } from "@/lib/maya/history";
import { BuilderWorkspace } from "./builder-workspace";

export const metadata: Metadata = { title: "Intake Builder — LegalRoute" };

export default async function TemplateBuilderPage({ params }: PageProps<"/intake-builder/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const [template] = await db
    .select()
    .from(intakeTemplates)
    .where(and(eq(intakeTemplates.id, id), eq(intakeTemplates.lawFirmId, user.firm.id)));
  if (!template) notFound();
  const messages = (await loadChat(user.firm.id, "template", template.id)).map(toChatDto);

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/intake-builder" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft className="size-4" aria-hidden /> All intakes
      </Link>
      <BuilderWorkspace
        template={{
          id: template.id,
          name: template.name,
          practiceArea: template.practiceArea,
          config: template.config,
          publishedConfig: template.publishedConfig,
          publishedAt: template.publishedAt?.toISOString() ?? null,
        }}
        isDefault={user.firm.defaultTemplateId === template.id}
        intakeUrl={`/intake/${user.firm.slug}`}
        messages={messages}
        userInitials={initials(user.name ?? user.email)}
      />
    </div>
  );
}
