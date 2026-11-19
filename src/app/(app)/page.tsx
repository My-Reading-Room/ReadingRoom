import { Suspense } from "react";

import { requireUser } from "@/utils/supabase/server";

async function Greeting() {
  const { supabase, claims } = await requireUser();

  // RLS limits this to rows the signed-in user may see; the filter just picks theirs.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", claims.sub)
    .maybeSingle();

  return <h1 className="heading">Welcome back, {profile?.display_name ?? "reader"}.</h1>;
}

export default function HomePage() {
  return (
    <>
      <div className="eyebrow">Your reading room</div>
      <Suspense fallback={<h1 className="heading">Welcome back.</h1>}>
        <Greeting />
      </Suspense>
      <p className="subtitle">
        The Next.js app is being built. Library, sessions and insights are coming over from the
        legacy app.
      </p>
    </>
  );
}
