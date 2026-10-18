import { Feather } from "lucide-react";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-xl";
  const icon = size === "lg" ? "size-9" : size === "sm" ? "size-5" : "size-6";
  return (
    <span className="flex items-center gap-2">
      <Feather className={`${icon} text-orange-600`} strokeWidth={2} aria-hidden />
      <span className={`font-serif font-semibold tracking-tight text-slate-900 ${text}`}>LegalRoute</span>
    </span>
  );
}
