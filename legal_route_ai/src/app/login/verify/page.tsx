import type { Metadata } from "next";
import Link from "next/link";
import { peekLoginToken } from "@/lib/auth";
import { confirmLogin } from "../actions";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = { title: "Sign in — LegalRoute" };

// A button press (POST) uses the token, so email scanners that prefetch the link can't burn it.
export default async function VerifyPage({ searchParams }: PageProps<"/login/verify">) {
  const { token, next } = await searchParams;
  const row = typeof token === "string" ? await peekLoginToken(token) : null;

  return (
    <AuthShell>
      {row ? (
        <form action={confirmLogin} className="flex flex-col items-center gap-5 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-3xl font-semibold">Sign in</h1>
            <p className="text-slate-500">
              Continue as <span className="font-medium text-slate-800">{row.email}</span>
            </p>
          </div>
          <input type="hidden" name="token" value={token as string} />
          <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
          <button type="submit" className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800">
            Continue to LegalRoute
          </button>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="font-serif text-3xl font-semibold">Link expired</h1>
          <p className="text-slate-500">This sign-in link has expired or was already used.</p>
          <Link href="/login" className="font-medium text-orange-700 hover:underline">
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
