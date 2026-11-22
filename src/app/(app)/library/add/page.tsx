import type { Metadata } from "next";
import Link from "next/link";

import { AddBooks } from "./AddBooks";

export const metadata: Metadata = { title: "Add books" };

export default function AddBooksPage() {
  return (
    <>
      <Link href="/library" className="back-link">
        ← My Library
      </Link>
      <div className="eyebrow">Your collection</div>
      <h1 className="heading">Add books</h1>
      <AddBooks />
    </>
  );
}
