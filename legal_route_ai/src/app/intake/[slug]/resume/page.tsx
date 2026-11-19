import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, lawFirms } from "@/db";
import { getSettings } from "@/lib/settings";
import { ResumeGate } from "./resume-gate";
export const metadata = { title: "Resume private intake — LegalRoute", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function ResumePage({ params }: PageProps<"/intake/[slug]/resume">) {
  const { slug } = await params;
  const [firm] = await db.select({ name: lawFirms.name }).from(lawFirms).where(eq(lawFirms.slug, slug));
  if (!firm) notFound();
  const settings = await getSettings();
  return <main className="min-h-screen bg-orange-50 px-4 py-10"><ResumeGate slug={slug} firmName={firm.name} silenceMs={settings.silenceMs} allowInterrupt={settings.allowInterrupt} /></main>;
}
