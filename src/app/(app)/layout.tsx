import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { LogoutButton } from "@/components/LogoutButton";
import { requireUser } from "@/utils/supabase/server";

async function SignedInAs() {
  const { claims } = await requireUser();
  return <span className="top-sub">{claims.email}</span>;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <Image src="/icon.svg" alt="" width={34} height={34} />
          <strong>
            reading <em>room.</em>
          </strong>
        </Link>
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
