import { redirect } from "next/navigation";

export default function Home() {
  // Middleware sends unauthenticated visitors to /login before this runs.
  redirect("/dashboard");
}
