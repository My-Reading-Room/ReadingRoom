"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { BookCover } from "@/components/BookCover";
import type { LibraryBook } from "@/data/library";
import { coverColor } from "@/lib/book-display";
import {
  BOOKS_PER_PAGE,
  shelfBookSize,
  shelfDisplayOrder,
  shelfNeighbour,
  showsSpine,
  type ShelfPrefs,
} from "@/lib/shelf";

import { moveShelfBook, saveShelfPrefs, type ShelfResult } from "./actions";

const FILTERS = [
  ["all", "All books"],
  ["favorites", "Favorites"],
  ["tbr", "TBR"],
  ["reading", "Reading"],
  ["finished", "Finished"],
  ["dnf", "DNF"],
] as const;
const MODES = {
  reading: "Reading only",
  audiobook: "Audiobook only",
  read_listen: "Read + Listen",
} as const;
const FINISHES: readonly (readonly [string, string])[] = [
  ["walnut", "Walnut"],
  ["oak", "Light Oak"],
  ["slate", "Slate"],
];
const DISPLAY: readonly (readonly [string, string])[] = [
  ["mix", "Mixed"],
  ["covers", "Show covers"],
  ["spines", "Show spines"],
];
const DECOR: readonly (readonly [string, string])[] = [
  ["cozy", "Cozy decor"],
  ["plant", "Plants"],
  ["minimal", "No decor"],
];

export function ShelfView({
  books,
  prefs,
  editable,
}: {
  books: LibraryBook[];
  prefs: ShelfPrefs;
  editable: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const [mode, setMode] = useState("all");
  const [page, setPage] = useState(0);
  const [moving, setMoving] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [result, setResult] = useState<ShelfResult>({});
  const [pending, startTransition] = useTransition();

  const list = useMemo(() => {
    let shown = books;
    if (filter === "favorites") shown = shown.filter((b) => b.favorite);
    else if (filter !== "all") shown = shown.filter((b) => b.status === filter);
    if (mode !== "all")
      shown = shown.filter((b) => b.modes.includes(mode as LibraryBook["modes"][number]));
    return shelfDisplayOrder(shown);
  }, [books, filter, mode]);
  const pages = Math.max(1, Math.ceil(list.length / BOOKS_PER_PAGE));
  const current = Math.min(page, pages - 1);
  const visible = list.slice(current * BOOKS_PER_PAGE, (current + 1) * BOOKS_PER_PAGE);
  const selected = list.some((b) => b.id === moving) ? moving : (list[0]?.id ?? "");

  const run = (action: () => Promise<ShelfResult>) =>
    startTransition(async () => setResult(await action()));
  const move = (fromId: string, toId: string | null) => {
    if (!toId) return setResult({ message: "That book is already at the edge of your shelf." });
    run(() => moveShelfBook(fromId, toId));
  };
  const savePref = (key: keyof ShelfPrefs, value: string) =>
    run(() => saveShelfPrefs({ ...prefs, [key]: value }));

  return (
    <>
      <div className="shelf-controls">
        <select
          className="select"
          aria-label="Which books"
          value={filter}
          onChange={(e) => (setFilter(e.target.value), setPage(0))}
        >
          {FILTERS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label="Filter shelf by reading mode"
          value={mode}
          onChange={(e) => (setMode(e.target.value), setPage(0))}
        >
          <option value="all">All reading modes</option>
          {Object.entries(MODES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        {(
          [
            ["finish", "Wood finish", FINISHES],
            ["display_mode", "Book display mode", DISPLAY],
            ["decor", "Shelf decoration", DECOR],
          ] as const
        ).map(([key, label, options]) => (
          <select
            key={key}
            className="select"
            aria-label={label}
            value={prefs[key]}
            disabled={!editable || pending}
            onChange={(e) => savePref(key, e.target.value)}
          >
            {options.map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </select>
        ))}
      </div>
      {(result.error || result.message) && (
        <div
          className={`notice ${result.error ? "error" : ""}`}
          role={result.error ? "alert" : "status"}
        >
          {result.error ?? result.message}
        </div>
      )}

      <div className={`shelf-box ${prefs.finish}`}>
        {[0, 1, 2].map((tier) => {
          const decor =
            prefs.decor === "minimal"
              ? ""
              : prefs.decor === "plant"
                ? "🪴"
                : ["🪴", "🕯️", "🖼️"][tier];
          return (
            <div key={tier} className="shelf-tier">
              {visible.slice(tier * 3, tier * 3 + 3).map((b, j) => {
                const { thickness, height } = shelfBookSize(b);
                const spine = showsSpine(prefs.display_mode, tier * 3 + j);
                return (
                  <Link
                    key={b.id}
                    href={`/books/${b.id}`}
                    className={`shelf-book ${spine ? "spine" : ""} ${over === b.id ? "drop-target" : ""}`}
                    style={
                      {
                        "--thick": `${thickness}px`,
                        "--book-color": coverColor(b.title),
                        "--ink-color": "#f6eacf",
                        height,
                      } as React.CSSProperties
                    }
                    title={`${b.title} · ${b.page_count || "Unknown"} pages · ${b.modes.map((m) => MODES[m]).join(", ") || "Unlogged"}`}
                    draggable={editable}
                    onDragStart={(e) => {
                      setDragging(b.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => (setDragging(null), setOver(null))}
                    onDragOver={(e) => {
                      if (!dragging || dragging === b.id) return;
                      e.preventDefault();
                      setOver(b.id);
                    }}
                    onDragLeave={() => setOver((o) => (o === b.id ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setOver(null);
                      if (dragging && dragging !== b.id) move(dragging, b.id);
                      setDragging(null);
                    }}
                  >
                    {spine ? (
                      <span className="spine-text">{b.title}</span>
                    ) : (
                      <BookCover title={b.title} author={b.author} coverUrl={b.cover_url} />
                    )}
                  </Link>
                );
              })}
              {decor && (
                <span className="shelf-decor" aria-label="Decoration">
                  {decor}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="shelf-page-controls" aria-label="Bookshelf pages">
          <button
            type="button"
            className="btn sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            ‹ Previous
          </button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <button
            type="button"
            className="btn sm"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next ›
          </button>
        </div>
      )}
      {!list.length && (
        <p className="notice warn">
          This shelf has no books yet. Mark books as Favorites or choose another shelf above.
        </p>
      )}
      <p className="tiny shelf-note">
        {visible.length} of {list.length} books shown, across three shelves per page. Favorites and
        Currently Reading appear first. Book height and thickness follow edition measurements when
        provided, otherwise approximate visual sizes from page counts.
        {editable
          ? " Drag books to rearrange on desktop, or use Move left / right after choosing a book."
          : ""}
      </p>
      {editable && list.length > 0 && (
        <div className="card soft">
          <h2 className="section-title">Arrange your collection</h2>
          <p className="section-sub">Choose a book to shift its position on the shelf.</p>
          <div className="toolbar form-footer">
            <select
              className="select shelf-move-select"
              aria-label="Book to move"
              value={selected}
              onChange={(e) => setMoving(e.target.value)}
            >
              {list.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
            <button
              className="btn sm"
              type="button"
              disabled={pending}
              onClick={() => move(selected, shelfNeighbour(books, selected, -1))}
            >
              ‹ Move left
            </button>
            <button
              className="btn sm"
              type="button"
              disabled={pending}
              onClick={() => move(selected, shelfNeighbour(books, selected, 1))}
            >
              Move right ›
            </button>
          </div>
        </div>
      )}
    </>
  );
}
