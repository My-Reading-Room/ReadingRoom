import { redirect } from "next/navigation";

/** Like the legacy app, the reading room opens on Insights. */
export default function HomePage() {
  redirect("/insights");
}
