"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useActionForm } from "@/hooks/useActionForm";
import { useReadingClock } from "@/hooks/useReadingClock";
import { START_SOURCE_LABELS, useSessionLogForm } from "@/hooks/useSessionLogForm";
import { ACTIVITY_LABELS, statusText } from "@/lib/book-display";
import { sessionBookChoices } from "@/lib/session-book-picker";
import { suggestedLocalSessionTime } from "@/lib/session-start-suggestion";
import type { ChapterBound } from "@/lib/session-log";
import type { LogBook, LogSession } from "@/data/log";

import { saveSession, type LogActionState } from "./actions";

type Props = {
  userId: string;
  books: LogBook[];
  selected: LogBook | null;
  bookSessions: LogSession[];
  chapters: (ChapterBound & { chapter_label: string | null })[];
  date: string;
  today: string;
};

export function LogForm({ userId, books, selected, bookSessions, chapters, date, today }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [scope, setScope] = useState<"reading" | "all">(
    selected && selected.status !== "reading" ? "all" : "reading",
  );
  const [query, setQuery] = useState("");
  const [startOverride, setStartOverride] = useState(false);
  const clock = useReadingClock(userId);
  const form = useSessionLogForm(selected, bookSessions, chapters, date);
  const save = useActionForm<LogActionState>(saveSession, {});
  const { values, set } = form;

  const choices = useMemo(() => {
    const list = sessionBookChoices(books, scope, query);
    // Keep the selected book listed even if a search or shelf filter hides it.
    return selected && !list.some((b) => b.id === selected.id) ? [selected, ...list] : list;
  }, [books, scope, query, selected]);

  const navigate = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  // Suggest a start time for today's logs only; backdated times are never
  // guessed. The suggestion shows until the reader types their own time.
  const [timeTouched, setTimeTouched] = useState(false);
  const suggestedTime = suggestedLocalSessionTime({
    date,
    clockStartedAtMs: clock.firstStartedAtMs,
  });
  const startTime = timeTouched ? values.startTime : suggestedTime;

  // After a successful save: clear the entry and the stopwatch, keep mode and
  // method. (Adjusting state when a value changes, during render.)
  const { message } = save.state;
  const [handledMessage, setHandledMessage] = useState(message);
  if (message !== handledMessage) {
    setHandledMessage(message);
    if (message) {
      form.reset({ mode: values.mode, method: values.method });
      setTimeTouched(false);
    }
  }
  // The stopwatch lives in device storage (an external system): reset it in an effect.
  const resetClock = clock.reset;
  useEffect(() => {
    if (message) resetClock();
  }, [message, resetClock]);

  const audio = values.mode !== "reading";
  const pagesWord = values.mode === "audiobook" ? "page-equivalents" : "pages";

  return (
    <section className="card">
      <h2 className="section-title">New reading session</h2>
      {books.length === 0 ? (
        <div className="notice warn">Add a book to your library before logging reading.</div>
      ) : (
        <form onSubmit={save.onSubmit} className="log-form">
          <input type="hidden" name="bookId" value={selected?.id ?? ""} />
          <input type="hidden" name="today" value={today} />
          {Object.entries({ ...values, startTime }).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}

          <div className="formgrid">
            <div className="formfield">
              <label htmlFor="log-book">Book</label>
              {scope === "all" && (
                <input
                  className="input log-book-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search all books by title or author…"
                  aria-label="Search books to log"
                />
              )}
              <select
                id="log-book"
                className="select"
                value={selected?.id ?? ""}
                onChange={(e) => navigate({ book: e.target.value })}
              >
                {!selected && <option value="">Choose a book…</option>}
                {choices.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                    {scope === "all" ? ` · ${statusText(b.status)}` : ""}
                  </option>
                ))}
              </select>
              <div className="log-book-tools">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => setScope(scope === "all" ? "reading" : "all")}
                >
                  {scope === "all" ? "Back to currently reading" : "Choose another book"}
                </button>
              </div>
              <p className="tiny">
                {scope === "all"
                  ? "Searching your full library. Select a past book to backdate a session. Logging a TBR book moves it to Currently Reading."
                  : `Showing ${choices.length} currently reading book${choices.length === 1 ? "" : "s"}.`}
              </p>
            </div>
            <div className="formfield">
              <label htmlFor="log-date">Date</label>
              <input
                type="date"
                className="input"
                id="log-date"
                value={date}
                max={today}
                onChange={(e) => e.target.value && navigate({ date: e.target.value })}
              />
            </div>
          </div>

          {selected && (
            <>
              <div className="formfield log-pass">
                <label htmlFor="log-pass">Reading pass</label>
                <select
                  id="log-pass"
                  className="select"
                  value={values.pass}
                  onChange={(e) => set("pass", e.target.value)}
                >
                  <option value="auto">Automatically choose: read #{form.pass}</option>
                  {form.passes.map((p) => (
                    <option key={p.number} value={p.number}>
                      {p.number === 1 ? "Original read" : `Reread #${p.number - 1}`} ·{" "}
                      {statusText(p.status)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="formfield log-mode">
                <label htmlFor="log-mode">Activity label</label>
                <select
                  id="log-mode"
                  className="select"
                  value={values.mode}
                  onChange={(e) => {
                    set("mode", e.target.value);
                    if (e.target.value === "reading" && values.method === "audio_position")
                      set("method", "pages");
                  }}
                >
                  {Object.entries(ACTIVITY_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="log-methods">
                {(
                  [
                    [
                      "pages",
                      "Time + Ending Page",
                      audio
                        ? "Enter the print-equivalent page reached"
                        : "Enter the page you stopped on",
                    ],
                    ["chapters", "Time + Chapters", "Exact edition mapping only"],
                    ...(audio
                      ? [["audio_position", "Time + Audio Position", "Track audiobook timestamps"]]
                      : []),
                  ] as [string, string, string][]
                ).map(([id, label, desc]) => (
                  <button
                    key={id}
                    type="button"
                    className={`method ${values.method === id ? "active" : ""}`}
                    aria-pressed={values.method === id}
                    onClick={() => set("method", id)}
                  >
                    {label}
                    <div className="desc">{desc}</div>
                  </button>
                ))}
              </div>

              <div className="formfield">
                <label htmlFor="log-start-time">Local session start time (editable)</label>
                <input
                  type="time"
                  className="input log-time"
                  id="log-start-time"
                  value={startTime}
                  onChange={(e) => {
                    setTimeTouched(true);
                    set("startTime", e.target.value);
                  }}
                />
                <p className="tiny">
                  {date === today
                    ? "Suggested from your device's clock. Correct it if your reading began earlier."
                    : "Backdated log: enter the actual start time if known; older times are never guessed."}{" "}
                  Leave blank if unknown.
                </p>
              </div>

              <div className="formgrid">
                <div className="formfield">
                  <label htmlFor="log-minutes">Session time (minutes)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={1440}
                    step={1}
                    id="log-minutes"
                    value={values.minutes}
                    onChange={(e) => set("minutes", e.target.value)}
                  />
                </div>

                {values.method === "pages" && (
                  <div className="formfield">
                    <label htmlFor="log-ending-page">
                      {values.mode === "audiobook"
                        ? "Print-edition equivalent page left off on"
                        : "Page left off on"}
                    </label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      step={1}
                      id="log-ending-page"
                      max={selected.page_count ?? undefined}
                      value={values.endingPage}
                      placeholder={`e.g. ${Number(form.startPage ?? 0) + 25}`}
                      onChange={(e) => set("endingPage", e.target.value)}
                    />
                    <p className="page-progress-source">
                      Starting from{" "}
                      <strong>
                        {form.startPage == null ? "unknown" : `page ${form.startPage}`}
                      </strong>{" "}
                      · {START_SOURCE_LABELS[form.startSource]}
                      {selected.page_count ? ` · ${selected.page_count} total pages` : ""}
                    </p>
                    {form.pagePreview && (
                      <p
                        className={`page-progress-result ${form.pagePreview.error ? "invalid" : ""}`}
                        role="status"
                      >
                        {form.pagePreview.error ??
                          `${form.pagePreview.pages} ${pagesWord} progressed (${form.startPage} → ${values.endingPage})`}
                      </p>
                    )}
                    {(startOverride || form.context?.startPage == null) && (
                      <>
                        <label htmlFor="log-starting-page">Starting page before this session</label>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step={1}
                          id="log-starting-page"
                          value={values.startingPage}
                          placeholder="Required for older sessions"
                          onChange={(e) => set("startingPage", e.target.value)}
                        />
                      </>
                    )}
                    {form.context?.startPage != null && (
                      <button
                        type="button"
                        className="btn text"
                        onClick={() => setStartOverride((o) => !o)}
                      >
                        {startOverride ? "Hide starting-page editor" : "Correct starting page"}
                      </button>
                    )}
                    {form.context?.hasLaterSessions && (
                      <p className="help">
                        Backdated entry: later session totals are not recalculated.{" "}
                        {form.context.laterSessionHasUnknownStart
                          ? "The next older-format log has no saved starting page; check for overlap."
                          : "Ending page cannot go beyond the next logged starting page."}
                      </p>
                    )}
                  </div>
                )}
                {values.method === "chapters" && (
                  <div className="formfield">
                    <label>
                      {values.mode === "audiobook"
                        ? "Exact page-equivalents from chapters"
                        : "Exact pages from chapters"}
                    </label>
                    <div className="input readout">
                      {form.chapterPages === null
                        ? "Mapping required"
                        : `${form.chapterPages} pages`}
                    </div>
                  </div>
                )}
                {values.method === "audio_position" && (
                  <div className="formfield">
                    <label>Audiobook progress</label>
                    <div className="input readout">Elapsed position · no page estimate</div>
                  </div>
                )}
              </div>

              {values.method === "chapters" && (
                <>
                  <div className="formgrid">
                    {(["chapterFrom", "chapterTo"] as const).map((key) => (
                      <div key={key} className="formfield">
                        <label htmlFor={`log-${key}`}>
                          {key === "chapterFrom" ? "From chapter" : "Through chapter"}
                        </label>
                        <select
                          id={`log-${key}`}
                          className="select"
                          value={values[key] || String(chapters[0]?.chapter_number ?? "")}
                          onChange={(e) => set(key, e.target.value)}
                        >
                          {chapters.map((c) => (
                            <option key={c.chapter_number} value={c.chapter_number}>
                              {c.chapter_label || `Chapter ${c.chapter_number}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className={`notice ${form.chapterPages === null ? "warn" : ""}`}>
                    {chapters.length
                      ? `${chapters.length} mapped chapters for this edition. ${
                          form.chapterPages === null
                            ? "The selected range has gaps or is incomplete."
                            : `This range equals ${form.chapterPages} exact pages.`
                        }`
                      : "No exact chapter boundaries have been entered for this edition."}{" "}
                    No chapters are averaged or estimated.{" "}
                    <Link href={`/books/${selected.id}?tab=chapters`}>
                      Manage exact chapter boundaries
                    </Link>
                  </div>
                </>
              )}

              {values.method === "audio_position" && (
                <div className="formgrid">
                  <div className="formfield">
                    <label htmlFor="log-audio-start">Audiobook start position (minutes)</label>
                    <input
                      className="input"
                      id="log-audio-start"
                      type="number"
                      min={0}
                      step={1}
                      value={values.audioStart}
                      onChange={(e) => set("audioStart", e.target.value)}
                    />
                  </div>
                  <div className="formfield">
                    <label htmlFor="log-audio-end">End position (minutes)</label>
                    <input
                      className="input"
                      id="log-audio-end"
                      type="number"
                      min={1}
                      step={1}
                      value={values.audioEnd}
                      onChange={(e) => set("audioEnd", e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="timer reading-clock">
                <div className="clock-top">
                  <div>
                    <strong>Optional reading stopwatch</strong>
                    <div className="tiny">
                      Start and pause while reading, or enter minutes above.
                    </div>
                  </div>
                  <span className="status-pill">
                    {clock.running ? "Running" : clock.hasTime ? "Paused" : "Ready"}
                  </span>
                </div>
                <strong className="clock-face" role="timer" aria-label="Elapsed reading time">
                  {clock.display}
                </strong>
                <div className="clock-actions">
                  <button type="button" className="btn sm primary" onClick={clock.toggle}>
                    {clock.running ? "Pause" : clock.hasTime ? "Resume" : "Start"}
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={!clock.hasTime}
                    onClick={() => set("minutes", String(clock.stopAndUse() || ""))}
                  >
                    Stop &amp; use time
                  </button>
                  <button type="button" className="btn sm" onClick={clock.reset}>
                    Reset
                  </button>
                </div>
                <p className="tiny">
                  Elapsed time comes from timestamps, not background ticks. The stopwatch is stored
                  on this device and cleared when you log out.
                </p>
              </div>
            </>
          )}

          {save.state.error && (
            <div className="notice error" role="alert">
              {save.state.error}
            </div>
          )}
          {save.state.message && (
            <div className="notice" role="status">
              {save.state.message}
            </div>
          )}
          <button className="btn primary block" type="submit" disabled={!selected || save.pending}>
            {save.pending ? "Saving…" : "+ Save reading session"}
          </button>
        </form>
      )}
    </section>
  );
}
