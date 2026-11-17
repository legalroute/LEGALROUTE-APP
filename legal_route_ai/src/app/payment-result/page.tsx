export const metadata = { title: "Payment checkout — LegalRoute" };
export default async function PaymentResult({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams;
  return <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6"><h1 className="font-serif text-3xl font-semibold">{result === "cancelled" ? "Checkout cancelled" : "Thank you"}</h1><p className="text-slate-600">{result === "cancelled" ? "You can reopen your original payment link to try again before it expires." : "If your payment completed, your law firm will receive confirmation from Stripe. You can close this page."}</p><p className="text-sm text-slate-500">This is a test payment flow. No real money was charged.</p></main>;
}
