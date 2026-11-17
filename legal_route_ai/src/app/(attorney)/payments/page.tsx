import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PaymentPanel } from "./payment-panel";
export const metadata = { title: "Payments — LegalRoute" };
export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const user = await requireUser(), params = await searchParams;
  return <div className="mx-auto max-w-6xl"><PageHeader title="Payments" subtitle="Create client payment requests and track Stripe test payments." />{params.checkout && <p role="status" className="mb-4 rounded-xl bg-slate-100 p-4 text-sm">{params.checkout === "cancelled" ? "Checkout was closed. The request remains available until it expires." : "Returned from Stripe. Payment status updates after the verified webhook arrives; refresh if needed."}</p>}<PaymentPanel user={user} /></div>;
}
