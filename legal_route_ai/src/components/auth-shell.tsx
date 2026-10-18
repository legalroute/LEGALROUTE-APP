import { cookies } from "next/headers";
import { THEME_COOKIE, themeClass } from "@/lib/theme";
import { Logo } from "./logo";

// Centered card used by the sign-in screens, in the theme last chosen in this browser.
export async function AuthShell({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <main className={`relative grid min-h-screen place-items-center overflow-hidden ${themeClass(theme)} bg-[var(--app-bg)] px-4 py-12 text-slate-900`}>
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 size-[36rem] rounded-full bg-orange-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-40 -bottom-40 size-[36rem] rounded-full bg-rose-200/40 blur-3xl" />
      <div className="relative flex w-full max-w-md flex-col gap-8 rounded-3xl border border-white bg-white/80 p-8 shadow-[0_20px_60px_-20px_var(--card-glow)] backdrop-blur-xl sm:p-10">
        <div className="flex justify-center">
          <Logo size="lg" />
        </div>
        {children}
      </div>
    </main>
  );
}
