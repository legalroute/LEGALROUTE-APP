import { and, eq } from "drizzle-orm";
import { db, datasets, connectorConnections } from "@/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ImportIntake } from "./import-intake";
export const metadata = { title: "Generate intake — LegalRoute" };
export default async function ImportPage() {
  const user = await requireUser();
  if (!["admin", "attorney"].includes(user.role)) return <p>An attorney or administrator must create intake forms.</p>;
  const tables = await db.select({ id: datasets.id, name: datasets.name }).from(datasets).innerJoin(connectorConnections, and(eq(connectorConnections.id, datasets.connectionId), eq(connectorConnections.lawFirmId, user.firm.id), eq(connectorConnections.status, "connected"))).where(eq(datasets.lawFirmId, user.firm.id));
  return <div className="mx-auto max-w-4xl"><PageHeader title="Generate an intake form" subtitle="Start from a connected Google Sheet or an Excel/CSV upload. Preview the questions, then customize your draft." /><ImportIntake tables={tables} /></div>;
}
