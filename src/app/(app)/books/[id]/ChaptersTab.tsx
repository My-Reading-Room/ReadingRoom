"use client";

import { useEffect, useState, useTransition } from "react";

import { useActionForm } from "@/hooks/useActionForm";
import { useChapterDraft } from "@/hooks/useChapterDraft";
import type { ChapterRow } from "@/lib/chapter-edits";
import {
  draftFromContentsText,
  isbn13ForEdition,
  reviewedSharedCandidate,
} from "@/lib/chapter-sourcing";
import type { UserBook } from "@/lib/types";

import type { BookActionState } from "./actions";
import { ContentsPhotoScanner } from "./ContentsPhotoScanner";
import {
  deleteChapter,
  findOpenLibraryChapters,
  findSharedChapterMaps,
  publishChapterMap,
  saveChapter,
  saveChapterMap,
  withdrawChapterMap,
  type SharedMapOption,
} from "./chapter-actions";

type Props = { book: UserBook; chapters: ChapterRow[]; editable: boolean };

export function ChaptersTab({ book, chapters, editable }: Props) {
  const draft = useChapterDraft();
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [options, setOptions] = useState<SharedMapOption[]>([]);
  const [busy, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const map = useActionForm<BookActionState>(saveChapterMap.bind(null, book.id), {});
  const one = useActionForm<BookActionState>(saveChapter.bind(null, book.id), {});
  // Only the most recent action's message is shown, so results don't pile up.
  const [last, setLast] = useState<"source" | "map" | "one" | null>(null);
  const discard = draft.discard;
  useEffect(() => {
    if (map.state.message) discard(); // saved: the reviewed draft is done
  }, [map.state, discard]);
  const validISBN = Boolean(isbn13ForEdition(book.isbn));

  const run = (task: () => Promise<BookActionState>) =>
    startTransition(async () => {
      setLast("source");
      const r = await task();
      setNotice({ text: r.error ?? r.message ?? "", error: Boolean(r.error) });
      setConfirm(null);
    });
  const found = (count: number) => {
    setLast("source");
    setNotice({
      text: `${count} candidate chapters found. Check every starting and ending page against this exact edition before saving.`,
    });
  };

  return (
    <section className="chapters-tab">
      <h3 className="small-title">Exact chapter boundaries</h3>
      <p className="section-sub">
        Boundaries are entered for this specific edition{book.isbn ? ` (ISBN ${book.isbn})` : ""}.
        Only completely mapped chapter ranges can be logged. There are no page estimates.
      </p>

      {chapters.length === 0 ? (
        <p className="notice warn">
          No exact chapters mapped. Add page boundaries below to enable time + chapters logging.
        </p>
      ) : (
        <div className="chapter-list">
          {chapters.map((c) => (
            <div key={c.id} className="chapter-item">
              <div>
                <strong>{c.chapter_label || `Chapter ${c.chapter_number}`}</strong>
                <div className="small">
                  Chapter {c.chapter_number} · pp. {c.start_page}–{c.end_page} ·{" "}
                  {c.end_page - c.start_page + 1} pages
                </div>
              </div>
              {editable &&
                (confirm === c.id ? (
                  <span className="inline">
                    <button
                      className="btn sm danger"
                      disabled={busy}
                      onClick={() => run(() => deleteChapter(book.id, c.id))}
                    >
                      Delete
                    </button>
                    <button className="btn sm" onClick={() => setConfirm(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    className="btn sm danger"
                    aria-label={`Delete chapter ${c.chapter_number}`}
                    onClick={() => setConfirm(c.id)}
                  >
                    ✕
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <section className="chapter-source-panel" aria-label="Find chapter boundaries">
          <h3 className="small-title">Find chapter pages</h3>
          <p className="tiny">
            Sources are starting points, not confirmed chapter lengths. The saved map is always
            specific to your print edition.
          </p>
          {validISBN ? (
            <div className="chapter-source-actions toolbar">
              <button
                className="btn sm"
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    const r = await findOpenLibraryChapters(book.id);
                    if (r.draft) {
                      draft.install(r.draft);
                      found(r.draft.rows.length);
                    } else {
                      setLast("source");
                      setNotice({ text: r.error ?? "No chapters found.", error: true });
                    }
                  })
                }
              >
                Look up Open Library
              </button>
              <button
                className="btn sm"
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    const r = await findSharedChapterMaps(book.id);
                    setOptions(r.options ?? []);
                    setLast("source");
                    setNotice(
                      r.error
                        ? { text: r.error, error: true }
                        : {
                            text: r.options?.length
                              ? `${r.options.length} shared map(s) found for your ISBN. Choose one to review.`
                              : "No community map has been contributed for this ISBN yet.",
                          },
                    );
                  })
                }
              >
                Find shared mappings
              </button>
            </div>
          ) : (
            <div className="notice warn">
              Add and save a valid ISBN under Book details to use exact-edition Open Library and
              community matches.
            </div>
          )}

          <ContentsPhotoScanner
            onDraft={(d) => {
              draft.install(d);
              found(d.rows.length);
            }}
            onError={(text) => {
              setLast("source");
              setNotice({ text, error: true });
            }}
          />

          <details className="chapter-paste">
            <summary>Paste the table of contents</summary>
            <textarea
              className="textarea"
              rows={4}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={
                "Prologue .......... 1\nChapter 1 .......... 12\nChapter 2 .......... 28"
              }
              maxLength={50000}
            />
            <button
              className="btn sm"
              type="button"
              onClick={() => {
                try {
                  const parsed = draftFromContentsText(pasted);
                  draft.install(parsed);
                  found(parsed.rows.length);
                } catch (e) {
                  setLast("source");
                  setNotice({ text: (e as Error).message, error: true });
                }
              }}
            >
              Read pasted contents
            </button>
          </details>

          {busy && (
            <div className="notice" role="status">
              Working…
            </div>
          )}
          {last === "source" && notice?.text && !busy && (
            <div
              className={`notice ${notice.error ? "error" : ""}`}
              role={notice.error ? "alert" : "status"}
            >
              {notice.text}
            </div>
          )}

          {options.length > 0 && (
            <div className="chapter-sharing-results">
              <h4>Matching ISBN contributions</h4>
              <p className="tiny">
                Reader-submitted maps are not independently checked. Pick one to review before
                importing.
              </p>
              {options.map((opt) => (
                <div key={opt.id} className="chapter-sharing-result">
                  <span>
                    <strong>{opt.chapters?.length ?? 0} chapters</strong>
                    <small>
                      {opt.page_count ? `${opt.page_count}-page edition · ` : ""}Contributed mapping
                    </small>
                  </span>
                  <button
                    className="btn sm"
                    onClick={() => {
                      try {
                        const rows = reviewedSharedCandidate(opt, book.isbn);
                        draft.install({
                          source: "Reader-contributed map",
                          sourcePages: opt.page_count || null,
                          rows: rows.map((r) => ({
                            ...r,
                            start_page: Number(r.start_page),
                            end_page: Number(r.end_page),
                          })),
                          warnings: [
                            "Community contributions are not independently verified; check each boundary before saving.",
                          ],
                        });
                        found(rows.length);
                      } catch (e) {
                        setLast("source");
                        setNotice({ text: (e as Error).message, error: true });
                      }
                    }}
                  >
                    Review map
                  </button>
                </div>
              ))}
            </div>
          )}

          {draft.meta && (
            <form
              className="chapter-candidate-card"
              onSubmit={(e) => {
                setLast("map");
                map.onSubmit(e);
              }}
            >
              <input type="hidden" name="rows" value={JSON.stringify(draft.payload)} />
              <div className="chapter-candidate-heading">
                <div>
                  <h4>Review candidate map</h4>
                  <p className="tiny">
                    Source: <strong>{draft.meta.source}</strong>
                    {draft.meta.sourceTitle ? ` · ${draft.meta.sourceTitle}` : ""}
                    {draft.meta.sourcePages ? ` · ${draft.meta.sourcePages} pages in source` : ""}
                    {draft.meta.sourceUrl && (
                      <>
                        {" · "}
                        <a href={draft.meta.sourceUrl} target="_blank" rel="noopener noreferrer">
                          View source
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <span className="chapter-count">{draft.rows.length} entries</span>
              </div>
              {draft.meta.sourcePages &&
                book.page_count &&
                draft.meta.sourcePages !== book.page_count && (
                  <div className="notice warn">
                    Catalog lists {draft.meta.sourcePages} pages; your edition is saved as{" "}
                    {book.page_count}. Confirm you have the correct printing.
                  </div>
                )}
              {(draft.meta.warnings ?? []).length > 0 && (
                <div className="notice warn">{draft.meta.warnings.slice(0, 4).join(" ")}</div>
              )}
              <div className="notice warn">
                Suggested end pages are calculated from the following chapter&apos;s start and{" "}
                <strong>must be checked</strong>. The last chapter&apos;s end stays blank until you
                enter it.
              </div>
              <div className="chapter-draft-header" aria-hidden="true">
                <span>Chapter / title</span>
                <span>First page</span>
                <span>Last page</span>
                <span />
              </div>
              <div className="chapter-candidate-rows">
                {draft.rows.map((row, i) => (
                  <div key={row.key} className="chapter-candidate-row">
                    <div className="chapter-draft-title">
                      <span className="chapter-row-number">{i + 1}</span>
                      <input
                        className="input"
                        aria-label={`Chapter ${i + 1} title`}
                        maxLength={180}
                        value={row.chapter_label}
                        onChange={(e) => draft.update(row.key, "chapter_label", e.target.value)}
                      />
                    </div>
                    <input
                      className="input"
                      aria-label={`Chapter ${i + 1} first page`}
                      type="number"
                      min={1}
                      value={row.start_page}
                      onChange={(e) => draft.update(row.key, "start_page", e.target.value)}
                    />
                    <input
                      className="input"
                      aria-label={`Chapter ${i + 1} last page`}
                      type="number"
                      min={1}
                      placeholder="Check"
                      value={row.end_page}
                      onChange={(e) => draft.update(row.key, "end_page", e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn sm icon-only danger"
                      aria-label={`Remove chapter ${i + 1}`}
                      onClick={() => draft.removeRow(row.key)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="chapter-draft-actions toolbar">
                <button type="button" className="btn sm" onClick={draft.addRow}>
                  + Add chapter
                </button>
                <button type="button" className="btn sm" onClick={draft.discard}>
                  Discard draft
                </button>
              </div>
              <label className="chapter-confirmation">
                <input type="checkbox" name="verified" />
                <span>
                  I&apos;ve verified every chapter&apos;s starting and ending page against this
                  exact book edition. Existing sessions keep the pages recorded when they were
                  logged.
                </span>
              </label>
              <button className="btn primary chapter-save-all" type="submit" disabled={map.pending}>
                Save verified chapter map{chapters.length ? " (replace existing)" : ""}
              </button>
            </form>
          )}
          {last === "map" && (map.state.error || map.state.message) && (
            <div
              className={`notice ${map.state.error ? "error" : ""}`}
              role={map.state.error ? "alert" : "status"}
            >
              {map.state.error ?? map.state.message}
            </div>
          )}

          {chapters.length > 0 && validISBN && (
            <div className="chapter-share-existing">
              <strong>Help other readers with this ISBN</strong>
              <p className="tiny">
                Share only these chapter titles and page ranges, not your profile, reading sessions
                or notes. Other users must review the mapping before use.
              </p>
              {confirm === "publish" ? (
                <div className="notice warn confirm-box">
                  <p>
                    Contribute your current chapter names and page boundaries for this ISBN to other
                    signed-in readers?
                  </p>
                  <button
                    className="btn primary sm"
                    disabled={busy}
                    onClick={() => run(() => publishChapterMap(book.id))}
                  >
                    Contribute
                  </button>{" "}
                  <button className="btn sm" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </div>
              ) : confirm === "withdraw" ? (
                <div className="notice warn confirm-box">
                  <p>
                    Withdraw your contributed map for this ISBN? Your personal chapters and sessions
                    stay unchanged.
                  </p>
                  <button
                    className="btn sm danger"
                    disabled={busy}
                    onClick={() => run(() => withdrawChapterMap(book.id))}
                  >
                    Withdraw
                  </button>{" "}
                  <button className="btn sm" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="toolbar">
                  <button className="btn sm" onClick={() => setConfirm("publish")}>
                    Contribute my verified map
                  </button>
                  <button className="btn sm" onClick={() => setConfirm("withdraw")}>
                    Withdraw my contribution
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="divider" />
          <h3 className="small-title">Add or update an exact chapter</h3>
          <form
            onSubmit={(e) => {
              setLast("one");
              one.onSubmit(e);
            }}
          >
            <div className="formgrid three">
              <div className="formfield">
                <label htmlFor="chapter-number">Chapter number</label>
                <input
                  className="input"
                  id="chapter-number"
                  name="chapter_number"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="1"
                  required
                />
              </div>
              <div className="formfield">
                <label htmlFor="chapter-start">First page</label>
                <input
                  className="input"
                  id="chapter-start"
                  name="start_page"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="1"
                  required
                />
              </div>
              <div className="formfield">
                <label htmlFor="chapter-end">Last page</label>
                <input
                  className="input"
                  id="chapter-end"
                  name="end_page"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="18"
                  required
                />
              </div>
              <div className="formfield span3">
                <label htmlFor="chapter-title">Optional chapter title</label>
                <input
                  className="input"
                  id="chapter-title"
                  name="title"
                  maxLength={180}
                  placeholder="e.g., Part One: A Beginning"
                />
              </div>
            </div>
            <button className="btn primary form-footer" type="submit" disabled={one.pending}>
              + Save exact boundary
            </button>
            {last === "one" && (one.state.error || one.state.message) && (
              <div
                className={`notice ${one.state.error ? "error" : ""}`}
                role={one.state.error ? "alert" : "status"}
              >
                {one.state.error ?? one.state.message}
              </div>
            )}
          </form>
        </section>
      )}
    </section>
  );
}
