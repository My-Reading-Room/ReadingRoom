import { describe, expect, test } from "vitest";

import { chapterRangePages, planSessionLog, type SessionLogInput } from "@/lib/session-log";

const today = "2026-11-20";
const book = {
  id: "dune",
  title: "Dune",
  status: "reading",
  page_count: 604,
  current_page: 120,
  started_on: "2026-11-01",
};
const input = (changes: Partial<SessionLogInput> = {}): SessionLogInput => ({
  date: today,
  minutes: "30",
  mode: "reading",
  method: "pages",
  pass: "auto",
  startTime: "",
  endingPage: "150",
  startingPage: "",
  chapterFrom: "",
  chapterTo: "",
  audioStart: "",
  audioEnd: "",
  ...changes,
});
const plan = (
  changes: Partial<SessionLogInput> = {},
  b = book,
  sessions: object[] = [],
  chapters = [] as never[],
) => planSessionLog(b, sessions, chapters, input(changes), { today });
const error = (r: ReturnType<typeof plan>) => ("error" in r ? r.error : null);
const ok = (r: ReturnType<typeof plan>) => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("time + ending page", () => {
  test("starts at the book's current page and moves progress forward", () => {
    const r = ok(plan());
    expect(r.session).toMatchObject({
      pages_read: 30,
      start_page: 120,
      end_page: 150,
      read_number: 1,
      log_type: "pages",
    });
    expect(r.book.current_page).toBe(150);
    expect(r.summary).toBe("Saved Reading only: 30 min, 30 pages for Dune (page 150).");
  });

  test("a manually corrected starting page wins", () => {
    expect(ok(plan({ startingPage: "100" })).session.pages_read).toBe(50);
  });

  test("ending page must be after the start and within the edition", () => {
    expect(error(plan({ endingPage: "110" }))).toMatch(/later than starting page 120/);
    expect(error(plan({ endingPage: "700" }))).toMatch(/604 pages/);
  });

  test("a backdated session before later ones does not move current progress", () => {
    const later = [
      {
        user_book_id: "dune",
        session_date: "2026-11-15",
        start_page: 200,
        end_page: 230,
        read_number: 1,
      },
    ];
    const r = ok(plan({ date: "2026-11-10", endingPage: "180" }, book, later));
    expect(r.session.start_page).toBe(0); // no earlier session in this pass
    expect(r.book.current_page).toBe(120);
    expect(error(plan({ date: "2026-11-10", endingPage: "210" }, book, later))).toMatch(
      /overlap a later recorded session/,
    );
  });
});

describe("time + chapters", () => {
  const chapters = [
    { chapter_number: 1, start_page: 1, end_page: 18 },
    { chapter_number: 2, start_page: 19, end_page: 40 },
    { chapter_number: 4, start_page: 61, end_page: 80 },
  ];
  test("pages are the exact sum of mapped chapters, and progress jumps to the last chapter's end", () => {
    const r = ok(
      plan(
        { method: "chapters", chapterFrom: "1", chapterTo: "2" },
        { ...book, current_page: 5 },
        [],
        chapters as never,
      ),
    );
    expect(r.session).toMatchObject({
      pages_read: 40,
      chapter_from: 1,
      chapter_to: 2,
      start_page: null,
      end_page: null,
    });
    expect(r.book.current_page).toBe(40);
  });
  test("a range with an unmapped chapter is refused (no estimates)", () => {
    expect(
      error(
        plan({ method: "chapters", chapterFrom: "2", chapterTo: "4" }, book, [], chapters as never),
      ),
    ).toMatch(/exact page boundaries/);
    expect(chapterRangePages(chapters, 2, 4)).toBeNull();
  });
});

describe("time + audio position", () => {
  test("audiobook positions record no pages", () => {
    const r = ok(
      plan({ mode: "audiobook", method: "audio_position", audioStart: "10", audioEnd: "55" }),
    );
    expect(r.session).toMatchObject({
      pages_read: null,
      audio_start_minute: 10,
      audio_end_minute: 55,
    });
    expect(r.book.current_page).toBe(120);
  });
  test("not allowed for reading-only, and positions must increase", () => {
    expect(error(plan({ method: "audio_position", audioStart: "1", audioEnd: "2" }))).toMatch(
      /only to listening/,
    );
    expect(
      error(
        plan({ mode: "audiobook", method: "audio_position", audioStart: "50", audioEnd: "50" }),
      ),
    ).toMatch(/later end minute/);
  });
});

describe("validation and side effects", () => {
  test("rejects bad minutes, future dates, modes, methods and start times", () => {
    for (const [change, message] of [
      [{ minutes: "0" }, /valid reading minutes/],
      [{ minutes: "1441" }, /valid reading minutes/],
      [{ date: "2026-11-21" }, /on or before today/],
      [{ mode: "skimming" }, /valid reading mode/],
      [{ method: "guess" }, /valid logging method/],
      [{ startTime: "25:00" }, /valid local start time/],
    ] as const) {
      expect(error(plan(change)), JSON.stringify(change)).toMatch(message);
    }
  });

  test("logging a TBR book starts it", () => {
    const r = ok(
      plan(
        { endingPage: "20" },
        { ...book, status: "tbr", current_page: 0, started_on: null as never },
      ),
    );
    expect(r.book).toEqual({ current_page: 20, status: "reading", started_on: today });
  });

  test("a finished pass cannot absorb new sessions; a reread can", () => {
    const finished = {
      ...book,
      status: "finished",
      finished_on: "2026-11-10",
      read_history: [
        { number: 1, status: "finished", started_on: "2026-11-01", finished_on: "2026-11-10" },
      ],
    };
    expect(error(plan({}, finished))).toMatch(/already finished/);
  });
});
