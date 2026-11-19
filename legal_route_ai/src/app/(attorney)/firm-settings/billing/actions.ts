"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { paymentService, PaymentError } from "@legalroute/backend/services/payments/service";
export type PaymentState = { error?: string; link?: string; done?: string };
export async function createPayment(_prev: PaymentState, form: FormData): Promise<PaymentState> {
  const user = await requireUser();
  try {
    const result = await paymentService.create(user, { clientId: form.get("clientId"), requestKey: form.get("requestKey"), description: form.get("description"), amount: form.get("amount") });
    revalidatePath("/firm-settings"); revalidatePath(`/clients/${result.clientId}`);
    return { link: result.status === "pending" ? result.checkoutUrl ?? undefined : undefined, done: result.status === "paid" ? "This request is already paid." : "Test payment request created. Open or share its Stripe Checkout link; no email was sent." };
  } catch (error) {
    return { error: error instanceof PaymentError ? error.message : "Could not create the request. Check Stripe configuration and try again with the same request. If details were changed after submission, reload the page." };
  }
}
