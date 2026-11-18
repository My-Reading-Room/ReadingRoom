// A page position is a snapshot, not the same thing as a session's page count.
// Legacy sessions have pages_read but no reliable start/end positions: never
// invent an ending page by adding their durations or page counts together.
const pageNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/**
 * Determine the page where this session starts. An up-to-date current pass
 * uses Book details > Current page. Backdated/older passes must use a recorded
 * earlier ending page, start at zero if there is no earlier session, or ask
 * for a starting page when legacy sessions make it unknowable.
 */
export function sessionPageStart(book, sessions, { date, readNumber, currentPass } = {}) {
  if (!book || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ||
      !Number.isInteger(Number(readNumber)) || Number(readNumber) < 1) {
    return { startPage: null, source: 'unknown', hasLaterSessions: false, nextStartPage: null };
  }
  const rows = (sessions || [])
    .filter(s => s.user_book_id === book.id && Number(s.read_number || 1) === Number(readNumber) &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(s.session_date || '')))
    .map((s, index) => ({ ...s, _order: index }))
    .sort((a, b) => a.session_date.localeCompare(b.session_date) ||
      String(a.created_at || '').localeCompare(String(b.created_at || '')) || a._order - b._order);
  const previous = rows.filter(s => s.session_date <= date);
  const later = rows.filter(s => s.session_date > date);
  const nextStartPage = later.length ? pageNumber(later[0].start_page) : null;
  const base = { hasLaterSessions: later.length > 0, nextStartPage,
    laterSessionHasUnknownStart: later.length > 0 && nextStartPage === null };

  if (!later.length && Number(readNumber) === Number(currentPass)) {
    const current = pageNumber(book.current_page);
    if (current !== null) return { ...base, startPage: current, source: 'book' };
  }
  if (!previous.length) return { ...base, startPage: 0, source: 'pass-start' };
  const ending = pageNumber(previous[previous.length - 1].end_page);
  if (ending !== null) return { ...base, startPage: ending, source: 'previous-session' };
  return { ...base, startPage: null, source: 'unknown' };
}

/** Return exactly the measured page delta. Do not infer pages from elapsed time. */
export function pagesFromEndingPage(startPage, endPage, bookPageCount = null, nextStartPage = null) {
  const start = pageNumber(startPage);
  const end = pageNumber(endPage);
  const max = pageNumber(bookPageCount);
  const next = pageNumber(nextStartPage);
  if (start === null) return { pages: null, error: 'Starting page is unknown. Enter it manually for this older session.' };
  if (end === null) return { pages: null, error: 'Enter the whole-number page where you stopped reading.' };
  if (end <= start) return { pages: null, error: `Ending page must be later than starting page ${start}.` };
  if (max !== null && max > 0 && end > max) return { pages: null, error: `Ending page cannot exceed the edition's ${max} pages.` };
  if (next !== null && end > next) return { pages: null, error: `This would overlap a later recorded session starting on page ${next}.` };
  return { pages: end - start, error: null };
}
