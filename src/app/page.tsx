import { redirect } from "next/navigation";

/** Stage 4 adds a sign-in check here; for now go straight to the dashboard. */
export default function Home() {
  redirect("/dashboard");
}
