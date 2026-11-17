import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import Stripe from "stripe";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema.ts";
import type { CurrentUser } from "../src/services/auth.ts";

test("Stripe test requests are firm-scoped, idempotent and paid only after verified reconciliation", async () => {
  process.env.DATABASE_URL ??= "postgres://localhost/unused_payment_test";
  process.env.APP_URL = "http://localhost:3000";
  const { createPaymentService, amountToCents, paymentConfigured, verifyStripeEvent } = await import("../src/services/payments/service.ts");
  assert.equal(amountToCents("123.45"), 12345);
  for (const value of ["0.49", "-1", "1.001", "NaN", "1e2", "1000000"]) assert.throws(() => amountToCents(value));
  process.env.STRIPE_SECRET_KEY = "sk_live_not_supported"; process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fixture";
  assert.equal(paymentConfigured(), false);
  process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
  const payload = JSON.stringify({ id: "evt_verified", object: "event", livemode: false, type: "unhandled", data: { object: {} } });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  assert.equal(verifyStripeEvent(payload, signature).id, "evt_verified");
  assert.throws(() => verifyStripeEvent(payload + " ", signature));
  const pg = await PGlite.create();
  try {
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    for (const entry of journal.entries as { tag: string }[]) await pg.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
    const firm = randomUUID(), otherFirm = randomUUID(), actorId = randomUUID(), clientId = randomUUID(), foreignClient = randomUUID();
    await pg.query("INSERT INTO law_firms (id,name,slug) VALUES ($1,'Pay A','pay-a'),($2,'Pay B','pay-b')", [firm, otherFirm]);
    await pg.query("INSERT INTO users (id,email,law_firm_id) VALUES ($1,'pay@test.example',$2)", [actorId, firm]);
    await pg.query("INSERT INTO clients (id,law_firm_id,name) VALUES ($1,$2,'Client A'),($3,$4,'Client B')", [clientId, firm, foreignClient, otherFirm]);
    const user = { id: actorId, role: "attorney", firm: { id: firm } } as CurrentUser;
    let current: Partial<Stripe.Checkout.Session> = {}, count = 0, lastIdempotencyKey = "", failOnce = false;
    const gateway = { checkout: { sessions: {
      create: async (params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => {
        count++; lastIdempotencyKey = options.idempotencyKey!;
        assert.equal(params.line_items?.[0]?.price_data?.unit_amount, 12345);
        current = { id: "cs_test_example", mode: "payment", livemode: false, url: "https://checkout.stripe.com/c/pay/example", expires_at: Math.floor(Date.now() / 1000) + 3600, metadata: params.metadata as Record<string, string>, client_reference_id: params.client_reference_id, currency: "usd", amount_total: 12345, payment_status: "unpaid", status: "open" };
        if (failOnce) { failOnce = false; throw new Error("Uncertain network failure"); }
        return current;
      }, retrieve: async () => current,
    } } } as unknown as Pick<Stripe, "checkout">;
    const service = createPaymentService(drizzle(pg, { schema }) as unknown as Parameters<typeof createPaymentService>[0], () => gateway);
    const input = { clientId, requestKey: randomUUID(), description: "Test consultation", amount: "123.45" };
    await assert.rejects(service.create({ ...user, role: "staff" }, input), /administrator/);
    await assert.rejects(service.create(user, { ...input, clientId: foreignClient }), /unavailable/);
    const result = await service.create(user, input);
    assert.equal(result.status, "pending");
    assert.equal(lastIdempotencyKey, `legalroute-payment:${result.id}`);
    assert.equal((await service.create(user, input)).id, result.id); assert.equal(count, 1);
    await assert.rejects(service.create(user, { ...input, amount: "124.00" }), /different details/);
    assert.equal((await service.list({ ...user, firm: { id: otherFirm } } as CurrentUser)).length, 0);
    const event = (id: string, type = "checkout.session.completed") => ({ id, type, livemode: false, data: { object: { id: current.id } } }) as Stripe.Event;
    await service.applyEvent(event("evt_unpaid"));
    assert.equal((await service.list(user))[0].payment.status, "pending");
    current.payment_status = "paid"; current.status = "complete";
    await service.applyEvent(event("evt_paid")); await service.applyEvent(event("evt_paid"));
    assert.equal((await service.list(user))[0].payment.status, "paid");
    assert.equal((await pg.query("SELECT * FROM activities WHERE kind='payment'")).rows.length, 1);
    current.payment_status = "unpaid"; current.status = "expired";
    await service.applyEvent(event("evt_late_expired", "checkout.session.expired"));
    assert.equal((await service.list(user))[0].payment.status, "paid");
    current.amount_total = 1;
    await assert.rejects(service.applyEvent(event("evt_wrong_amount")), /did not match/);
    assert.equal((await pg.query("SELECT * FROM payment_events WHERE id='evt_wrong_amount'")).rows.length, 0);
    // An uncertain create can be retried with the exact same Stripe idempotency key.
    const next = { ...input, requestKey: randomUUID() }; failOnce = true;
    await assert.rejects(service.create(user, next), /Uncertain/);
    const firstKey = lastIdempotencyKey;
    const pending = (await service.list(user)).find((r) => r.payment.requestKey === next.requestKey)!;
    assert.equal(pending.payment.status, "creating");
    // Use a distinct mock Stripe session for the next independent request.
    const originalCreate = gateway.checkout.sessions.create;
    gateway.checkout.sessions.create = (async (...args: Parameters<typeof originalCreate>) => { const created = await originalCreate(...args); return { ...created, id: "cs_test_retry" }; }) as typeof originalCreate;
    await service.create(user, next); assert.equal(lastIdempotencyKey, firstKey);
  } finally { await pg.close(); }
});
