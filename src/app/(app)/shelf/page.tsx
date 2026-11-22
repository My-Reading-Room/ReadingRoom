import type { Metadata } from "next";

import { getShelfData } from "@/data/shelf";

import { ShelfView } from "./ShelfView";

export const metadata: Metadata = { title: "Bookshelf" };

export default async function ShelfPage() {
  const { books, prefs, editable } = await getShelfData();
  return (
    <>
      <div className="eyebrow">Your home library</div>
      <h1 className="heading">The Bookshelf</h1>
      <p className="subtitle">
        Your collection, arranged with real covers, variable book sizes, and cozy decorations.
      </p>
      <ShelfView books={books} prefs={prefs} editable={editable} />
    </>
  );
}
