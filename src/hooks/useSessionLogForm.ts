"use client";

import { useState } from "react";

import { currentReadNumber, readNumberForDate, readingPasses } from "@/lib/reading-history";
import { chapterRangePages, type ChapterBound, type SessionLogInput } from "@/lib/session-log";
import { pagesFromEndingPage, sessionPageStart } from "@/lib/session-page-progress";
import type { BookInput, SessionInput } from "@/lib/types";

export const START_SOURCE_LABELS: Record<string, string> = {
  book: "Book details · Current page",
  "previous-session": "Previous logged ending page",
  "pass-start": "Start of this reading pass",
  manual: "Manually corrected starting page",
  unknown: "Not known from older reading sessions",
};

const blank = (date: string): SessionLogInput => ({
  date,
  minutes: "",
  mode: "reading",
  method: "pages",
  pass: "auto",
  startTime: "",
  endingPage: "",
  startingPage: "",
  chapterFrom: "",
  chapterTo: "",
  audioStart: "",
  audioEnd: "",
});

/**
 * Log Reading form state plus a live preview computed with the same functions
 * the server uses (the server recomputes everything when saving).
 */
export function useSessionLogForm(
  book: (BookInput & { id: string }) | null,
  sessions: SessionInput[],
  chapters: ChapterBound[],
  date: string,
) {
  const [values, setValues] = useState<SessionLogInput>(() => blank(date));
  const set = <K extends keyof SessionLogInput>(key: K, value: SessionLogInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const reset = (keep: Partial<SessionLogInput> = {}) =>
    setValues({ ...blank(values.date), ...keep });

  // Mirrors planSessionLog: a never-started book begins pass 1 on this date.
  const started =
    book && !readingPasses(book).length ? { ...book, status: "reading", started_on: date } : book;
  const passes = started ? readingPasses(started) : [];
  const pass = started
    ? values.pass === "auto"
      ? readNumberForDate(started, date)
      : Number(values.pass)
    : 1;
  const context = started
    ? sessionPageStart(started, sessions, {
        date,
        readNumber: pass,
        currentPass: currentReadNumber(started),
      })
    : null;
  const manualStart = values.startingPage !== "";
  const startPage = manualStart ? Number(values.startingPage) : (context?.startPage ?? null);
  const pagePreview =
    book && values.endingPage !== ""
      ? pagesFromEndingPage(
          startPage,
          values.endingPage,
          book.page_count,
          context?.nextStartPage ?? null,
        )
      : null;
  const sorted = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
  const from = Number(values.chapterFrom || sorted[0]?.chapter_number);
  const to = Number(values.chapterTo || sorted[0]?.chapter_number);
  const chapterPages = chapterRangePages(chapters, from, to);

  return {
    values,
    set,
    reset,
    passes,
    pass,
    context,
    startPage,
    startSource: manualStart ? "manual" : (context?.source ?? "unknown"),
    pagePreview,
    chapterPages,
  };
}
