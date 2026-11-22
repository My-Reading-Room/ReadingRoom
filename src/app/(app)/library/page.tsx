import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getOwnLibrary } from "@/data/library";

import { FillMetadataButton } from "./FillMetadataButton";
import { LibraryView } from "./LibraryView";

export const metadata: Metadata = { title: "My Library" };

async function Library() {
  const books = await getOwnLibrary();
  const favorites = books.filter((b) => b.favorite).length;
  return (
    <>
      <div className="toolbar space">
        <div>
          <h1 className="heading">My Library</h1>
          <p className="subtitle">
            {books.length} books · {favorites} favorites · Your personal catalog
          </p>
        </div>
        <Link href="/library/add" className="btn primary">
          + Add books
        </Link>
      </div>
      <LibraryView books={books} />
      <div className="toolbar library-tools">
        <Link className="btn" href="/library/import">
          ⇧ Import Goodreads CSV / JSON
        </Link>
        <FillMetadataButton />
      </div>
    </>
  );
}

export default function LibraryPage() {
  return (
    <>
      <div className="eyebrow">Your collection</div>
      <Suspense fallback={<p className="subtitle">Loading your library…</p>}>
        <Library />
      </Suspense>
    </>
  );
}
