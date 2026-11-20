import type { Metadata } from "next";
import { Suspense } from "react";

import { getOwnLibrary } from "@/data/library";

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
      </div>
      <LibraryView books={books} />
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
