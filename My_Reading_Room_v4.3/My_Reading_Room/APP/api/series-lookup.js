// Vercel serverless proxy keeps the third-party API key off the client.
// The free List Of Books plan requires a visible source link for each result.
const API='https://www.listofbooks.net/api/public/v1';
const clean=value=>String(Array.isArray(value)?value[0]:value||'').trim();
const allowed=value=>value.length<=200 && /^[\p{L}\p{N}]/u.test(value);
const safeLink=url=>{
  try{const u=new URL(url);return u.protocol==='https:'&&['listofbooks.net','www.listofbooks.net'].includes(u.hostname)&&u.pathname.startsWith('/series/')?url:'';}
  catch{return '';}
};
function safeResult(raw) {
  if(!raw||!raw.title||!safeLink(raw.url))return null;
  return {
    title:clean(raw.title).slice(0,200),author:clean(raw.author).slice(0,200),url:safeLink(raw.url),
    totalBooks:Number.isInteger(Number(raw.totalBooks))&&Number(raw.totalBooks)>0&&Number(raw.totalBooks)<=500?Number(raw.totalBooks):null,
    position:Number.isFinite(Number(raw.position))?Number(raw.position):null,
    order:raw.order==='reading'?'reading':'publication',booksOmitted:Number(raw.booksOmitted)||0,
    books:(Array.isArray(raw.books)?raw.books:[]).slice(0,200).map(b=>({title:clean(b.title).slice(0,220),
      position:Number.isFinite(Number(b.position))?Number(b.position):null,
      number:Number.isFinite(Number(b.number))?Number(b.number):null,
      role:clean(b.role||'core').slice(0,30),year:Number.isInteger(Number(b.year))?Number(b.year):null})).filter(b=>b.title)
  };
}
export default async function handler(req,res) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='GET')return res.status(405).json({code:'method_not_allowed',message:'GET required'});
  const mode=clean(req.query?.mode);
  if(mode==='status')return res.status(200).json({configured:Boolean(process.env.LOB_API_KEY)});
  if(!['book','series'].includes(mode))return res.status(400).json({code:'invalid_parameters',message:'Invalid lookup mode'});
  const key=process.env.LOB_API_KEY;
  if(!key)return res.status(503).json({code:'not_configured',message:'Series catalog lookup requires LOB_API_KEY in Vercel environment settings.'});
  const series=clean(req.query?.series),title=clean(req.query?.title),author=clean(req.query?.author);
  if(mode==='series'?!allowed(series)||series.length<3:!allowed(title)||!allowed(author))
    return res.status(400).json({code:'invalid_parameters',message:'Enter a valid series name, or a book title and author.'});
  const path=mode==='series'?'get-reading-order':'find-series-for-book';
  const params=new URLSearchParams(mode==='series'?{series}:{title,author});
  let response;
  try {response=await fetch(`${API}/${path}?${params}`,{headers:{'Authorization':`Bearer ${key}`,'Accept':'application/json'},signal:AbortSignal.timeout(8500)});}
  catch {return res.status(503).json({code:'provider_unavailable',message:'Series catalog is temporarily unavailable.'});}
  let data={};try{data=await response.json();}catch{}
  if(!response.ok){const code=data?.error?.code||'provider_error';const status=response.status===429?429:503;
    return res.status(status).json({code,message:code==='rate_limited'||code==='page_limit_reached'?'Series lookup limit reached. Try again later.':'Series catalog lookup failed.'});}
  const results=Array.isArray(data.results)?data.results:[];
  const picked=safeResult(results[0]);
  res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=1800');
  return res.status(200).json({result:picked,source:'List Of Books',withheld:Number(data.withheld)||0});
}
