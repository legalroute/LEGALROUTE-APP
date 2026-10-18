import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in — LegalRoute" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/home");
  const { next, error } = await searchParams;

  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-serif text-3xl font-semibold">Welcome back.</h1>
        <p className="text-slate-500">Sign in with your email to receive a magic link — no password needed.</p>
      </div>
      <LoginForm next={typeof next === "string" ? next : undefined} expired={error === "expired"} />
    </AuthShell>
  );
}
