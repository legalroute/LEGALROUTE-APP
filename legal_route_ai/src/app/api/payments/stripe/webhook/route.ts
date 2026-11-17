import { paymentConfigured, paymentService, verifyStripeEvent } from "@legalroute/backend/services/payments/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!paymentConfigured()) return Response.json({ error: "Payments are not configured." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature." }, { status: 400 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing payload." }, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 256 * 1024) { await reader.cancel(); return Response.json({ error: "Payload too large." }, { status: 413 }); } chunks.push(next.value); }
  } catch { return Response.json({ error: "Invalid payload." }, { status: 400 }); }
  let event;
  try { event = verifyStripeEvent(Buffer.concat(chunks).toString("utf8"), signature); }
  catch { return Response.json({ error: "Invalid signature or payload." }, { status: 400 }); }
  try { await paymentService.applyEvent(event); }
  catch { console.error("[stripe webhook] Processing failed; delivery should be retried."); return Response.json({ error: "Processing failed." }, { status: 500 }); }
  return Response.json({ received: true });
}
