// "Save reading session" rules, ported from legacy app.js saveLog() so they run
// on the server against fresh rows (#12). Pure: no I/O.
import {
  currentReadNumber,
  readNumberForDate,
  readingPasses,
  sessionPassError,
} from "./reading-history";
import { pagesFromEndingPage, sessionPageStart } from "./session-page-progress";
import type { ActivityMode, BookInput, IsoDate, SessionInput } from "./types";

export const ACTIVITY_MODES: ActivityMode[] = ["reading", "audiobook", "read_listen"];
export type LogMethod = "pages" | "chapters" | "audio_position";

/** Form values as submitted (strings; blank = not given). */
export type SessionLogInput = {
  date: string;
  minutes: string;
  mode: string;
  method: string;
  /** "auto" or a reading-pass number. */
  pass: string;
  startTime: string;
  endingPage: string;
  /** Manual correction of the starting page (blank = use the computed start). */
  startingPage: string;
  chapterFrom: string;
  chapterTo: string;
  audioStart: string;
  audioEnd: string;
};

export type ChapterBound = { chapter_number: number; start_page: number; end_page: number };

export type NewSession = {
  user_book_id: string;
  session_date: IsoDate;
  duration_minutes: number;
  start_local_time: string | null;
  activity_mode: ActivityMode;
  log_type: LogMethod;
  pages_read: number | null;
  start_page: number | null;
  end_page: number | null;
  chapter_from: number | null;
  chapter_to: number | null;
  audio_start_minute: number | null;
  audio_end_minute: number | null;
  read_number: number;
  notes: string;
};

export type BookProgressUpdate = {
  current_page: number;
  status: string;
  started_on: IsoDate | null;
};

export type SessionLogPlan =
  | { ok: true; session: NewSession; book: BookProgressUpdate; summary: string }
  | { ok: false; error: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Exact pages for a chapter range, or null if any chapter in it is unmapped. */
export function chapterRangePages(
  chapters: ChapterBound[],
  from: number,
  to: number,
): number | null {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) return null;
  const byNumber = new Map(chapters.map((c) => [c.chapter_number, c]));
  let pages = 0;
  for (let i = from; i <= to; i++) {
    const c = byNumber.get(i);
    if (!c) return null;
    pages += c.end_page - c.start_page + 1;
  }
  return pages;
}

export function planSessionLog(
  book: BookInput & { id: string },
  sessions: SessionInput[],
  chapters: ChapterBound[],
  input: SessionLogInput,
  { today }: { today: IsoDate },
): SessionLogPlan {
  const fail = (error: string): SessionLogPlan => ({ ok: false, error });
  const minutes = Number(input.minutes);
  const date = input.date;
  if (
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 1440 ||
    !ISO.test(date) ||
    date > today
  ) {
    return fail("Enter valid reading minutes and a date on or before today.");
  }
  const mode = input.mode as ActivityMode;
  if (!ACTIVITY_MODES.includes(mode)) return fail("Select a valid reading mode.");

  // A never-started (TBR) book has no reading passes yet; its first session
  // starts pass 1 on that date. (Legacy rejected this with "Choose a valid
  // reading pass", although the page promised logging would start the book.)
  const started = readingPasses(book).length
    ? book
    : { ...book, status: "reading", started_on: date };
  const passNumber =
    input.pass === "auto" || !input.pass ? readNumberForDate(started, date) : Number(input.pass);
  if (!Number.isInteger(passNumber) || passNumber < 1) return fail("Choose a valid reading pass.");
  const passIssue = sessionPassError(started, date, passNumber);
  if (passIssue) return fail(`${passIssue} Open the book and select Read history to correct it.`);

  const context = sessionPageStart(started, sessions, {
    date,
    readNumber: passNumber,
    currentPass: currentReadNumber(started),
  });
  let pages: number | null = null,
    from: number | null = null,
    to: number | null = null,
    audioStart: number | null = null,
    audioEnd: number | null = null,
    startPage: number | null = null,
    endPage: number | null = null;

  const method = input.method as LogMethod;
  if (method === "pages") {
    startPage = input.startingPage !== "" ? Number(input.startingPage) : context.startPage;
    const progress = pagesFromEndingPage(
      startPage,
      input.endingPage,
      book.page_count,
      context.nextStartPage,
    );
    if (progress.error) return fail(progress.error);
    pages = progress.pages;
    endPage = Number(input.endingPage);
  } else if (method === "chapters") {
    const sorted = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
    from = Number(input.chapterFrom || sorted[0]?.chapter_number);
    to = Number(input.chapterTo || sorted[0]?.chapter_number);
    pages = chapterRangePages(chapters, from, to);
    if (pages === null)
      return fail("Every selected chapter must have exact page boundaries for this edition.");
  } else if (method === "audio_position") {
    if (mode === "reading")
      return fail("Audio positions apply only to listening or read + listen.");
    audioStart = Number(input.audioStart);
    audioEnd = Number(input.audioEnd);
    if (
      !Number.isInteger(audioStart) ||
      !Number.isInteger(audioEnd) ||
      audioStart < 0 ||
      audioEnd <= audioStart
    ) {
      return fail("Audiobook position must have a valid start minute and a later end minute.");
    }
  } else {
    return fail("Select a valid logging method.");
  }
  if (input.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)) {
    return fail("Enter a valid local start time or leave it blank.");
  }

  const newPage =
    method === "chapters"
      ? Math.max(
          num(book.current_page),
          ...chapters
            .filter((c) => c.chapter_number >= from! && c.chapter_number <= to!)
            .map((c) => c.end_page),
        )
      : method === "pages"
        ? (endPage as number)
        : num(book.current_page);
  // A backdated entry or an earlier reading pass must not move current progress.
  const isLatestPass = passNumber === currentReadNumber(started) && !context.hasLaterSessions;
  const label = {
    reading: "Reading only",
    audiobook: "Audiobook only",
    read_listen: "Read + Listen",
  }[mode];
  const progressText =
    pages === null
      ? `audio position ${audioStart}–${audioEnd} min`
      : `${pages} ${mode === "audiobook" ? "page-equivalents" : "pages"}`;

  return {
    ok: true,
    session: {
      user_book_id: book.id,
      session_date: date,
      duration_minutes: minutes,
      start_local_time: input.startTime || null,
      activity_mode: mode,
      log_type: method,
      pages_read: pages,
      start_page: method === "pages" ? startPage : null,
      end_page: method === "pages" ? endPage : null,
      chapter_from: from,
      chapter_to: to,
      audio_start_minute: audioStart,
      audio_end_minute: audioEnd,
      read_number: passNumber,
      notes: "",
    },
    book: {
      current_page: isLatestPass ? newPage : num(book.current_page),
      status: book.status === "tbr" ? "reading" : String(book.status),
      started_on: book.status === "tbr" && !book.started_on ? date : (book.started_on ?? null),
    },
    summary: `Saved ${label}: ${minutes} min, ${progressText} for ${book.title}${method === "pages" ? ` (page ${endPage})` : ""}.`,
  };
}
