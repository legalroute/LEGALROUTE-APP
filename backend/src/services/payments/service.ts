import Stripe from "stripe";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, clients, paymentRequests, paymentEvents, activities } from "../../db/index.ts";
import type { CurrentUser } from "../auth.ts";
export class PaymentError extends Error {}
export function paymentConfigured() { return !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") && !!process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") && !!process.env.APP_URL; }
export function stripeClient() {
  if (!paymentConfigured()) throw new PaymentError("Configure a Stripe test secret key, webhook signing secret and APP_URL before creating payment requests.");
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { timeout: 15000, maxNetworkRetries: 2 });
}
export function paymentOrigin() {
  const url = new URL(process.env.APP_URL || "");
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new PaymentError("APP_URL must use HTTPS or localhost for development.");
  return url.origin;
}
export function amountToCents(value: string) {
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value)) throw new PaymentError("Enter a USD amount with at most two decimal places.");
  const [whole, fraction = ""] = value.split("."), cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents < 50 || cents > 99999999) throw new PaymentError("Use an amount between $0.50 and $999,999.99.");
  return cents;
}
const inputSchema = z.object({ clientId: z.string().uuid(), requestKey: z.string().uuid(), description: z.string().trim().min(1).max(200), amount: z.string().trim() });
type Gateway = Pick<Stripe, "checkout">;
export function createPaymentService(database = db, gateway: () => Gateway = stripeClient) {
  async function create(user: CurrentUser, input: unknown) {
    if (!["attorney", "admin"].includes(user.role)) throw new PaymentError("An attorney or administrator must create payment requests.");
    const data = inputSchema.parse(input), amountCents = amountToCents(data.amount), origin = paymentOrigin();
    const stripe = gateway();
    const [client] = await database.select().from(clients).where(and(eq(clients.id, data.clientId), eq(clients.lawFirmId, user.firm.id)));
    if (!client) throw new PaymentError("Client unavailable.");
    await database.insert(paymentRequests).values({ lawFirmId: user.firm.id, clientId: client.id, createdBy: user.id, requestKey: data.requestKey, description: data.description, amountCents }).onConflictDoNothing();
    const [record] = await database.select().from(paymentRequests).where(and(eq(paymentRequests.lawFirmId, user.firm.id), eq(paymentRequests.requestKey, data.requestKey)));
    if (!record || record.clientId !== client.id || record.description !== data.description || record.amountCents !== amountCents) throw new PaymentError("This request was already used with different details. Reload the page to create another request.");
    if (record.status !== "creating") return record;
    // Stripe keeps idempotency results for at least 24h; never recreate an uncertain older request.
    if (Date.now() - record.createdAt.getTime() > 23 * 3600000) throw new PaymentError("This unfinished request is too old to retry safely. Check Stripe before making a new request.");
    const session = await stripe.checkout.sessions.create({ mode: "payment", allowed_payment_method_types: ["card"],
      line_items: [{ price_data: { currency: "usd", unit_amount: amountCents, product_data: { name: data.description } }, quantity: 1 }],
      ...(client.email && z.email().safeParse(client.email).success ? { customer_email: client.email } : {}),
      client_reference_id: record.id, metadata: { paymentRequestId: record.id, lawFirmId: user.firm.id, clientId: client.id },
      success_url: `${origin}/payment-result?result=returned`, cancel_url: `${origin}/payment-result?result=cancelled`,
    }, { idempotencyKey: `legalroute-payment:${record.id}` });
    if (session.livemode || !session.url || new URL(session.url).origin !== "https://checkout.stripe.com") throw new PaymentError("Stripe did not return a valid test Checkout page.");
    const [saved] = await database.update(paymentRequests).set({ stripeSessionId: session.id, checkoutUrl: session.url, expiresAt: new Date(session.expires_at * 1000), status: "pending" }).where(and(eq(paymentRequests.id, record.id), eq(paymentRequests.lawFirmId, user.firm.id), eq(paymentRequests.status, "creating"))).returning();
    return saved ?? (await database.select().from(paymentRequests).where(and(eq(paymentRequests.id, record.id), eq(paymentRequests.lawFirmId, user.firm.id))))[0];
  }
  async function list(user: CurrentUser, clientId?: string) {
    if (clientId) z.string().uuid().parse(clientId);
    return database.select({ payment: paymentRequests, clientName: clients.name, expired: sql<boolean>`coalesce(${paymentRequests.expiresAt} <= now(), false)` }).from(paymentRequests).innerJoin(clients, and(eq(clients.id, paymentRequests.clientId), eq(clients.lawFirmId, user.firm.id)))
      .where(and(eq(paymentRequests.lawFirmId, user.firm.id), clientId ? eq(paymentRequests.clientId, clientId) : undefined)).orderBy(desc(paymentRequests.createdAt)).limit(100);
  }
  async function applyEvent(event: Stripe.Event) {
    if (event.livemode || event.account) throw new PaymentError("Only platform test events are supported by this first version.");
    if (!["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"].includes(event.type)) return;
    const delivered = event.data.object as Stripe.Checkout.Session;
    const session = await gateway().checkout.sessions.retrieve(delivered.id);
    if (session.livemode || session.mode !== "payment") throw new PaymentError("Invalid Checkout mode.");
    const metadata = z.object({ paymentRequestId: z.string().uuid(), lawFirmId: z.string().uuid(), clientId: z.string().uuid() }).parse(session.metadata);
    await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`payment:${metadata.paymentRequestId}`},0))`);
      const [record] = await tx.select().from(paymentRequests).where(and(eq(paymentRequests.id, metadata.paymentRequestId), eq(paymentRequests.lawFirmId, metadata.lawFirmId), eq(paymentRequests.clientId, metadata.clientId)));
      if (!record || session.client_reference_id !== record.id || (record.stripeSessionId && record.stripeSessionId !== session.id) || session.currency !== record.currency || session.amount_total !== record.amountCents) throw new PaymentError("Payment details did not match the request.");
      const [inserted] = await tx.insert(paymentEvents).values({ id: event.id, requestId: record.id, type: event.type }).onConflictDoNothing().returning();
      if (!inserted) return;
      const status = session.payment_status === "paid" ? "paid" : session.status === "expired" ? "expired" : "pending";
      // A late expiration or failure notification cannot reverse a verified payment.
      if (record.status === "paid") return;
      await tx.update(paymentRequests).set({ status, stripeSessionId: session.id, ...(status === "paid" ? { paidAt: new Date() } : {}) }).where(eq(paymentRequests.id, record.id));
      if (status === "paid") await tx.insert(activities).values({ lawFirmId: record.lawFirmId, clientId: record.clientId, kind: "payment", summary: `Stripe test payment received — ${record.description}` });
    });
  }
  return { create, list, applyEvent };
}
export const paymentService = createPaymentService();
export function verifyStripeEvent(payload: string, signature: string) {
  return stripeClient().webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}
