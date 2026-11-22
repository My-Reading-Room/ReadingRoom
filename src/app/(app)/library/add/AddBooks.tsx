"use client";

import { useState } from "react";

import { BookCover } from "@/components/BookCover";
import { useActionForm } from "@/hooks/useActionForm";
import { useCatalogSearch } from "@/hooks/useCatalogSearch";
import { useIsbnScanner } from "@/hooks/useIsbnScanner";
import { useLocalToday } from "@/hooks/useLocalToday";
import { STATUS_TEXT } from "@/lib/book-display";
import type { CatalogBook } from "@/lib/catalog";

import { GenrePicker } from "../../books/[id]/GenrePicker";
import { addCatalogBook, addManualBook, type AddState } from "./actions";

type Step = "search" | "editions" | "add";

function ShelfSelect({ id }: { id: string }) {
  return (
    <select className="select" id={id} name="status" defaultValue="tbr">
      {Object.entries(STATUS_TEXT).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function AddBooks() {
  const today = useLocalToday();
  const [tab, setTab] = useState<"search" | "manual">("search");
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<CatalogBook | null>(null);
  const catalog = useCatalogSearch();
  const addCatalog = useActionForm<AddState>(addCatalogBook, {});
  const addManual = useActionForm<AddState>(addManualBook, {});
  const { videoRef, ...scanner } = useIsbnScanner((isbn) => {
    setQuery(isbn);
    setStep("search");
    void catalog.search(isbn);
  });

  const choose = async (book: CatalogBook) => {
    setChosen(book);
    if (book.kind === "edition") return setStep("add");
    setStep("editions");
    await catalog.loadEditions(book);
  };

  return (
    <>
      <nav className="segmented book-tabs" aria-label="How to add">
        {(["search", "manual"] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={`seg-btn ${tab === id ? "active" : ""}`}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {id === "search" ? "Find a book" : "Add manually"}
          </button>
        ))}
      </nav>

      {tab === "search" && step === "search" && (
        <section className="card">
          <p className="section-sub">
            Search by title, author, or ISBN. Open Library is the primary catalog, with Google Books
            as a fallback.
          </p>
          <form
            className="toolbar add-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void catalog.search(query.trim());
            }}
          >
            <input
              className="input add-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, authors or ISBNs…"
              aria-label="Search the book catalog"
              maxLength={200}
              required
            />
            <button className="btn primary" type="submit" disabled={catalog.busy}>
              Search
            </button>
            <button
              className="btn"
              type="button"
              onClick={scanner.active ? scanner.stop : scanner.start}
            >
              {scanner.active ? "Stop camera" : "📷 Scan ISBN"}
            </button>
          </form>
          {scanner.active && (
            <div className="notice">Point your camera at the barcode on the back of your book.</div>
          )}
          <video
            ref={videoRef}
            className="isbn-camera"
            muted
            playsInline
            hidden={!scanner.active}
          />
          {scanner.error && (
            <div className="notice error" role="alert">
              {scanner.error}
            </div>
          )}
          {catalog.busy && (
            <div className="notice" role="status">
              Searching book catalogs…
            </div>
          )}
          {catalog.error && (
            <div className="notice error" role="alert">
              {catalog.error}
            </div>
          )}
          <div className="result-list">
            {catalog.results.map((b) => (
              <button
                key={`${b.source}-${b.key}`}
                type="button"
                className="result-row"
                onClick={() => choose(b)}
              >
                <BookCover title={b.title} author={b.author} coverUrl={b.cover_url} size="small" />
                <span className="result-text">
                  <span className="result-title">{b.title}</span>
                  <span className="result-desc">
                    {b.author} · {b.published_year || "Year unknown"}
                    {b.edition_count && b.kind === "work" ? ` · ${b.edition_count} editions` : ""}
                  </span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {tab === "search" && step === "editions" && chosen && (
        <section className="card">
          <p className="text-sm muted">
            {chosen.title} · {chosen.author}. Select the edition you are reading so the page count
            and ISBN match your copy.
          </p>
          {catalog.busy && <div className="notice">Loading editions…</div>}
          {!catalog.busy && catalog.editions.length === 0 && (
            <p className="notice warn">
              No editions returned. You can add the book manually or use the work itself.
            </p>
          )}
          <div className="result-list">
            {(catalog.editions.length ? catalog.editions : catalog.busy ? [] : [chosen]).map(
              (b, i) => (
                <button
                  key={`${b.key}-${i}`}
                  type="button"
                  className="result-row"
                  onClick={() => {
                    setChosen(b);
                    setStep("add");
                  }}
                >
                  <BookCover
                    title={b.title}
                    author={b.author}
                    coverUrl={b.cover_url}
                    size="small"
                  />
                  <span className="result-text">
                    <span className="result-title">{b.title}</span>
                    <span className="result-desc">
                      {b.published_year || "Unknown year"} ·{" "}
                      {b.page_count ? `${b.page_count} pages` : "Page count unavailable"}
                      {b.publisher ? ` · ${b.publisher}` : ""}
                      <br />
                      {b.isbn ? `ISBN ${b.isbn}` : "ISBN not listed"}
                    </span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              ),
            )}
          </div>
          <div className="toolbar">
            <button className="btn" type="button" onClick={() => setStep("search")}>
              ‹ Search results
            </button>
          </div>
        </section>
      )}

      {tab === "search" && step === "add" && chosen && (
        <form className="card" onSubmit={addCatalog.onSubmit}>
          <input type="hidden" name="edition" value={JSON.stringify(chosen)} />
          <input type="hidden" name="today" value={today} />
          <div className="detail-top">
            <BookCover
              title={chosen.title}
              author={chosen.author}
              coverUrl={chosen.cover_url}
              size="large"
            />
            <div className="book-blurb">
              <h2 className="section-title">{chosen.title}</h2>
              <p className="subtitle">{chosen.author}</p>
              <p className="text-sm muted">
                {chosen.page_count ? `${chosen.page_count} pages · ` : ""}
                {chosen.published_year || "Year unknown"}
                {chosen.isbn ? ` · ISBN ${chosen.isbn}` : ""}
              </p>
              <p className="tiny">
                {chosen.edition_key
                  ? "Specific edition selected"
                  : "Edition data may be incomplete"}
              </p>
            </div>
          </div>
          <div className="formgrid">
            <div className="formfield">
              <label htmlFor="new-book-status">Initial shelf</label>
              <ShelfSelect id="new-book-status" />
            </div>
            <div className="formfield">
              <label htmlFor="new-book-pages">Edition page count</label>
              <input
                className="input"
                id="new-book-pages"
                name="pages"
                type="number"
                min={1}
                defaultValue={chosen.page_count ?? ""}
                placeholder="Optional"
              />
            </div>
          </div>
          <p className="notice warn">
            To track chapters you&apos;ll need exact chapter page boundaries for this particular
            edition. Chapter lengths are never inferred.
          </p>
          {addCatalog.state.error && (
            <div className="notice error" role="alert">
              {addCatalog.state.error}
            </div>
          )}
          <div className="toolbar">
            <button
              className="btn"
              type="button"
              onClick={() =>
                setStep(
                  chosen.kind === "edition" && !catalog.editions.length ? "search" : "editions",
                )
              }
            >
              ‹ Back
            </button>
            <button className="btn primary" type="submit" disabled={addCatalog.pending}>
              {addCatalog.pending ? "Adding…" : "+ Add this book"}
            </button>
          </div>
        </form>
      )}

      {tab === "manual" && (
        <form className="card" onSubmit={addManual.onSubmit}>
          <input type="hidden" name="today" value={today} />
          <p className="section-sub">For books missing from the catalog or custom editions.</p>
          <div className="formgrid">
            <div className="formfield">
              <label htmlFor="manual-title">Title *</label>
              <input className="input" id="manual-title" name="title" required maxLength={500} />
            </div>
            <div className="formfield">
              <label htmlFor="manual-author">Author *</label>
              <input className="input" id="manual-author" name="author" required maxLength={300} />
            </div>
            <div className="formfield">
              <label htmlFor="manual-pages">Total pages</label>
              <input className="input" id="manual-pages" name="pages" type="number" min={1} />
            </div>
            <div className="formfield">
              <label htmlFor="manual-isbn">ISBN-10 / ISBN-13 (optional)</label>
              <input className="input" id="manual-isbn" name="isbn" placeholder="978..." />
            </div>
            <div className="formfield">
              <label htmlFor="manual-asin">Amazon ASIN (optional)</label>
              <input
                className="input"
                id="manual-asin"
                name="asin"
                maxLength={10}
                placeholder="B0..."
              />
            </div>
            <div className="formfield">
              <label htmlFor="manual-year">Publication year</label>
              <input
                className="input"
                id="manual-year"
                name="year"
                type="number"
                min={1400}
                max={2200}
              />
            </div>
            <div className="formfield span2">
              <label>Genres (select from standardized list)</label>
              <GenrePicker name="genres" initial={[]} />
            </div>
            <div className="formfield span2">
              <label htmlFor="manual-cover">Custom cover URL (HTTPS)</label>
              <input
                className="input"
                id="manual-cover"
                name="coverUrl"
                type="url"
                placeholder="https://.../cover.jpg"
              />
            </div>
            <div className="formfield">
              <label htmlFor="manual-status">Shelf</label>
              <ShelfSelect id="manual-status" />
            </div>
          </div>
          <p className="tiny">
            Saving an identifier does not contact a catalog. Open the book later and choose Look up
            metadata &amp; cover.
          </p>
          {addManual.state.error && (
            <div className="notice error" role="alert">
              {addManual.state.error}
            </div>
          )}
          <button className="btn primary" type="submit" disabled={addManual.pending}>
            {addManual.pending ? "Adding…" : "+ Add to library"}
          </button>
        </form>
      )}
    </>
  );
}
