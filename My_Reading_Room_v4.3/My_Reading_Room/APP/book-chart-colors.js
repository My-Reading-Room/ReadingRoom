/**
 * Chart-only colors for individual books. Cover/spine colors are intentionally
 * separate: two books may share a cover color, but plotted series must not.
 *
 * The categorical palette is ordered so adjacent choices have noticeably
 * different hue and lightness, including for readers with color-vision
 * differences. Assignment is deterministic for the visible books in a chart.
 */
export const BOOK_CHART_PALETTE = Object.freeze([
  '#277F98', // ocean blue
  '#C47738', // burnt orange
  '#7962A9', // amethyst
  '#47865A', // leaf green
  '#B64D78', // raspberry
  '#526EB8', // cobalt
  '#A48A36', // ochre
  '#258F86', // turquoise
  '#975847', // clay
  '#9574A5', // plum
  '#7C9041', // olive
  '#4C7085', // slate
  '#CC6450', // coral
  '#4E8B8E', // blue-green
  '#9D6790', // orchid
  '#826F43'  // umber
]);

const normalize = value => String(value ?? '');

/** Map book ID to a color, ignoring demo_color/cover color on purpose.
 * Only books with a session in this chart's selected dataset are assigned.
 * Same visible set -> same colors regardless of input order or session order.
 */
export function bookChartColors(books, sessions) {
  const visibleIds = new Set((sessions || []).map(s => normalize(s.user_book_id)));
  const visibleBooks = (books || []).filter(b => b?.id != null && visibleIds.has(normalize(b.id)));
  visibleBooks.sort((a, b) => normalize(a.title).localeCompare(normalize(b.title), 'en', {sensitivity: 'base'})
    || normalize(a.author).localeCompare(normalize(b.author), 'en', {sensitivity: 'base'})
    || normalize(a.id).localeCompare(normalize(b.id), 'en'));
  return new Map(visibleBooks.map((b, i) => {
    // Beyond the curated base, spread extra series through hue AND luminance;
    // never silently repeat an identical color for a 17th book.
    const extra = i - BOOK_CHART_PALETTE.length;
    const color = extra < 0 ? BOOK_CHART_PALETTE[i]
      : `hsl(${((31 + extra * 137.508) % 360).toFixed(1)} ${46 + Math.floor(extra / 24) % 3 * 5}% ${39 + Math.floor(extra / 16) % 3 * 7}%)`;
    return [normalize(b.id), color];
  }));
}
