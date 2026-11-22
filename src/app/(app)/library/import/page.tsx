import type { Metadata } from "next";
import Link from "next/link";

import { getOwnLibrary } from "@/data/library";
import { requireUser } from "@/utils/supabase/server";

import { ImportView } from "./ImportView";

export const metadata: Metadata = { title: "Import from Goodreads" };

export default async function ImportPage() {
  const [books, { claims }] = await Promise.all([getOwnLibrary(), requireUser()]);
  return (
    <>
      <Link href="/library" className="back-link">
        ← My Library
      </Link>
      <div className="eyebrow">Your collection</div>
      <h1 className="heading">Import from Goodreads</h1>
      <ImportView existing={books} userId={claims.sub} />
    </>
  );
}
