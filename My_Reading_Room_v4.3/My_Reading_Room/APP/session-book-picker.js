// Log Reading uses a focused list by default. Historical sessions can be logged
// for any owned book without changing the user's library-wide shelf filter.
export function sessionBookChoices(books, scope = 'reading', query = '') {
  const items = Array.isArray(books) ? books.filter(b => b && b.id) : [];
  const scoped = scope === 'all' ? items : items.filter(b => b.status === 'reading');
  const q = scope === 'all' ? String(query || '').trim().toLocaleLowerCase() : '';
  return (q ? scoped.filter(b => `${b.title || ''} ${b.author || ''}`.toLocaleLowerCase().includes(q)) : scoped)
    .slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')) || String(a.author || '').localeCompare(String(b.author || '')));
}
export function selectedSessionBookId(choices, currentId = '') {
  return choices.some(b => b.id === currentId) ? currentId : choices[0]?.id || '';
}
