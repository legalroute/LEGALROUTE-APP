import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Logo } from "@/components/logo";
import { questionCount } from "@/lib/intake-config";
import { resolvePublicIntake } from "@/lib/public-intake";
import { getSettings } from "@/lib/settings";
import { ASSISTANT_NAME } from "@/lib/template-intake";
import { themeClass } from "@/lib/theme";
import { IntakeGate } from "./intake-gate";

export async function generateMetadata({ params }: PageProps<"/intake/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolvePublicIntake(slug);
  return { title: resolved ? `${resolved.template?.name ?? "Intake"} — ${resolved.firm.name}` : "Intake — LegalRoute" };
}

// The firm's permanent, public intake link. No sign-in: clients open it and talk with Maya.
export default async function PublicIntakePage({ params, searchParams }: PageProps<"/intake/[slug]">) {
  await connection();
  const { slug } = await params;
  const { t } = await searchParams;
  const resolved = await resolvePublicIntake(slug, typeof t === "string" ? t : null);
  if (!resolved) notFound();
  const { firm, template } = resolved;
  const voice = await getSettings();
  const prefs = firm.settings;

  return (
    <div className={`${themeClass(prefs.theme)} relative min-h-screen overflow-hidden bg-[var(--app-bg)] text-slate-900`}>
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 size-[36rem] rounded-full bg-orange-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-40 -bottom-40 size-[36rem] rounded-full bg-rose-200/40 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <Logo size="lg" />
          <div className="text-right">
            <p className="font-semibold">{template?.name ?? "Client intake"}</p>
            <p className="text-sm text-slate-500">{firm.name}</p>
          </div>
        </header>

        {template ? (
          <IntakeGate
            slug={firm.slug}
            templateId={typeof t === "string" ? template.id : undefined}
            collectEmail={Boolean(prefs.collectEmailAtStart)}
            silenceMs={voice.silenceMs}
            allowInterrupt={voice.allowInterrupt}
            showProgress={prefs.showProgress !== false}
            reviewerName={firm.name}
            description={`A short spoken conversation with ${ASSISTANT_NAME}, ${firm.name}'s intake assistant. Just talk naturally; ${ASSISTANT_NAME} replies when you pause. There are about ${questionCount(template.publishedConfig)} questions.`}
            completeDetail={
              prefs.showThankYou !== false && prefs.thankYouMessage?.trim()
                ? prefs.thankYouMessage.trim()
                : `Thank you. An attorney from ${firm.name} will review your information`
            }
          />
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            {firm.name} hasn&apos;t published an intake yet. Please check back soon.
          </p>
        )}
      </div>
    </div>
  );
}
