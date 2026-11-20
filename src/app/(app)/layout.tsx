import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { LogoutButton } from "@/components/LogoutButton";
import { TimeZoneCookie } from "@/components/TimeZoneCookie";
import { requireUser } from "@/utils/supabase/server";

async function SignedInAs() {
  const { claims } = await requireUser();
  return <span className="top-sub">{claims.email}</span>;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="app-shell">
      <TimeZoneCookie />
      <header className="topbar">
        <Link className="brand" href="/insights">
          <Image src="/icon.svg" alt="" width={34} height={34} />
          <strong>
            reading <em>room.</em>
          </strong>
        </Link>
        <nav className="top-nav" aria-label="Main">
          <Link href="/insights">Insights</Link>
          <Link href="/recaps">Replay</Link>
          <Link href="/library">My Library</Link>
          <Link href="/log">Log Reading</Link>
          <Link href="/shelf">Bookshelf</Link>
          <Link href="/settings">Settings</Link>
        </nav>
        <div className="top-actions">
          <Suspense>
            <SignedInAs />
          </Suspense>
          <LogoutButton />
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
