/** Celebration availability for recently completed periods, per owner/device.
 * Only completed periods with recorded activity are eligible. There is no server
 * polling, new data table, push notification permission, or shared-profile leak.
 */
import {replayPeriod} from './reading-replay.js';
export const REPLAY_KINDS=['week','month','year'];
const RECENT_DAYS={week:14,month:40,year:90};
const asDay=(day)=>new Date(`${day}T12:00:00Z`).getTime();
export function replaySeenKey(ownerId,kind,end){
 if(!ownerId||!REPLAY_KINDS.includes(kind)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(end))throw new RangeError('Invalid replay marker');
 return `reading-room-replay-seen-v1:${encodeURIComponent(ownerId)}:${kind}:${end}`;
}
export function latestUnseenReplays({ownerId,today,storage,hasData=()=>true}={}){
 if(!ownerId)return [];
 const results=[];
 for(const kind of REPLAY_KINDS){
  const period=replayPeriod(kind,today);
  const age=Math.round((asDay(today)-asDay(period.end))/86400000);
  if(age<1||age>RECENT_DAYS[kind])continue;
  const key=replaySeenKey(ownerId,kind,period.end);
  let seen=false;try{seen=storage?.getItem(key)==='seen';}catch{/* private-mode storage */}
  if(!seen&&hasData(kind,period))results.push({kind,period,key});
 }
 return results;
}
export function markReplaySeen({ownerId,kind,end,storage}={}){
 const key=replaySeenKey(ownerId,kind,end);
 try{storage?.setItem(key,'seen');return true;}catch{return false;}
}
