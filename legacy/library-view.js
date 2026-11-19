// Shared card/table filters and deterministic sorting for My Library.
export function availableGenres(books) {
  const genres=new Set();
  for(const b of books) for(const g of b.genres||[]) if(String(g).trim()) genres.add(String(g).trim());
  return [...genres].sort((a,b)=>a.localeCompare(b));
}

export function filterLibraryBooks(books,{
  shelf='all',mode='all',genre='all',query='',modeForBook=()=>[],sort='shelf_order',sortDirection='asc'
}={}) {
  const q=String(query||'').trim().toLowerCase();
  let result=books.filter(book=>{
    if (shelf==='favorites' ? !book.favorite : shelf!=='all' && book.status!==shelf) return false;
    if (mode!=='all' && !modeForBook(book).includes(mode)) return false;
    if (genre==='__uncategorized__' ? (book.genres||[]).length : genre!=='all' && !(book.genres||[]).some(x=>x.toLowerCase()===genre.toLowerCase())) return false;
    return !q || `${book.title||''} ${book.author||''} ${(book.genres||[]).join(' ')} ${book.series_name||''} ${book.isbn||''} ${book.publisher||''}`.toLowerCase().includes(q);
  });
  const keys={title:'title',author:'author',genre:'genres',status:'status',rating:'rating',isbn:'isbn',page_count:'page_count',publisher:'publisher',binding:'binding',edition_year:'edition_year',original_published_year:'original_published_year',goodreads_added_on:'goodreads_added_on',tbr_added_on:'tbr_added_on',started_on:'started_on',finished_on:'finished_on'};
  const key=keys[sort]||'shelf_order',dir=sortDirection==='desc'?-1:1;
  result.sort((a,b)=>{
    const av=key==='genres'?(a.genres||[])[0]:a[key],bv=key==='genres'?(b.genres||[])[0]:b[key];
    if(av==null||av==='')return bv==null||bv===''?0:1;
    if(bv==null||bv==='')return -1;
    const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});
    return cmp*dir || (a.title||'').localeCompare(b.title||'');
  });
  return result;
}
