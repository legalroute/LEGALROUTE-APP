import { redirect } from "next/navigation";

// The attorney Home screen is the entry point; signed-out visitors are sent on to /login.
export default function RootPage() {
  redirect("/home");
}
