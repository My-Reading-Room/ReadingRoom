/** Local session start suggestion. A newly opened log uses the local wall clock, never UTC.
 * Backdated logs deliberately have no suggested hour: guessing an old time
 * would pollute reading-habits and friends-feed analytics.
 */
export function wallClockHHMM(date=new Date()){
  if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return '';
  return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}
export function wallClockDay(date=new Date()){
  if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
/** Source can be the first start of a running stopwatch, if its day matches. */
export function suggestedLocalSessionTime({date,now=new Date(),clockStartedAtMs=null}={}){
  if(date!==wallClockDay(now))return '';
  if(Number.isFinite(clockStartedAtMs)&&clockStartedAtMs>0){
    const started=new Date(clockStartedAtMs);
    if(wallClockDay(started)===date)return wallClockHHMM(started);
  }
  return wallClockHHMM(now);
}
