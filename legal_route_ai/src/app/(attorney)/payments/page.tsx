import { redirect } from "next/navigation";

export default function PaymentsPage() {
  redirect("/firm-settings?tab=billing");
}
