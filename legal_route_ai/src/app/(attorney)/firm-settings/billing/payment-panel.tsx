import { randomUUID } from "node:crypto";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, clients } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { Card, buttonClass } from "@/components/ui";
import { paymentConfigured, paymentService } from "@legalroute/backend/services/payments/service";
import { PaymentForm, RetryPayment } from "./payment-form";
export async function PaymentPanel({ user, clientId }: { user: CurrentUser; clientId?: string }) {
  const configured = paymentConfigured(), manage = ["attorney", "admin"].includes(user.role);
  const people = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.lawFirmId, user.firm.id)).orderBy(asc(clients.name));
  const rows = await paymentService.list(user, clientId);
  return <div className="space-y-5"><p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Stripe test mode only — no real money moves. Payment requests use Stripe-hosted Checkout. Status changes are confirmed by Stripe, not by the return page.</p>
    {manage && <Card className="space-y-3 p-5"><h2 className="text-xl font-semibold">New payment request</h2>{!configured ? <p className="text-sm text-slate-600">Stripe test setup is required. Configure STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and APP_URL on the server, then restart. See docs/payments/README.md.</p> : !people.length ? <p>Add a client first.</p> : <PaymentForm clients={clientId ? people.filter((c) => c.id === clientId) : people} clientId={clientId} requestKey={randomUUID()} />}</Card>}
    <Card className="p-5"><h2 className="mb-4 text-xl font-semibold">Payment requests</h2>{!rows.length ? <p className="text-sm text-slate-500">No payment requests yet.</p> : <div className="space-y-4">{rows.map(({ payment: p, clientName, expired }) => <div key={p.id} className="space-y-2 border-t pt-3"><div className="flex flex-wrap justify-between gap-2"><div><Link href={`/clients/${p.clientId}?tab=payments`} className="font-semibold text-orange-700">{clientName}</Link><p className="text-sm">{p.description}</p></div><p className="text-sm font-semibold">{new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency }).format(p.amountCents / 100)} · {p.status === "pending" && expired ? "Checkout expired; awaiting confirmation" : p.status}</p></div><p className="text-xs text-slate-500">Created {p.createdAt.toISOString()}{p.paidAt ? ` · Paid ${p.paidAt.toISOString()}` : ""}</p>{p.checkoutUrl && p.status === "pending" && !expired && <a href={p.checkoutUrl} target="_blank" rel="noreferrer" className={buttonClass.secondary}>Open Stripe test Checkout</a>}{p.status === "creating" && manage && configured && <RetryPayment id={p.requestKey} clientId={p.clientId} description={p.description} cents={p.amountCents} />}</div>)}</div>}</Card>
  </div>;
}
