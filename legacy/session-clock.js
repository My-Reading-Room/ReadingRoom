/** Optional reading stopwatch. Timestamp-based duration, never timer ticks. */
export function formatClock(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
    .map(n=>String(n).padStart(2,'0')).join(':');
}
const fresh=()=>({accumulatedMs:0,startedAtMs:null,firstStartedAtMs:null,running:false});
export class ReadingClock {
  constructor(storage=null,prefix='my-reading-room-stopwatch-v1.3:') {
    this.storage=storage;this.prefix=prefix;this.owner=null;this.data=fresh();
  }
  key(){return this.owner?this.prefix+this.owner:null;}
  save(){if(!this.key()||!this.storage)return;
    try{this.storage.setItem(this.key(),JSON.stringify(this.data));}catch{/* storage unavailable */}}
  setOwner(id){
    const owner=id?String(id):null;if(this.owner===owner)return;
    this.owner=owner;this.data=fresh();if(!this.key()||!this.storage)return;
    try{
      const row=JSON.parse(this.storage.getItem(this.key()));
      if(row&&Number.isFinite(row.accumulatedMs)&&row.accumulatedMs>=0&&typeof row.running==='boolean'&&
        (!row.running||(Number.isFinite(row.startedAtMs)&&row.startedAtMs>0)))this.data={
          accumulatedMs:row.accumulatedMs,startedAtMs:row.running?row.startedAtMs:null,firstStartedAtMs:Number.isFinite(row.firstStartedAtMs)?row.firstStartedAtMs:null,running:row.running
        };
    }catch{/* invalid saved draft */}
  }
  get running(){return this.data.running;}
  get firstStartedAtMs(){return this.data.firstStartedAtMs;}
  elapsedMs(now=Date.now()){
    return this.data.accumulatedMs+(this.data.running?Math.max(0,now-this.data.startedAtMs):0);
  }
  display(now=Date.now()){return formatClock(this.elapsedMs(now));}
  elapsedMinutes(now=Date.now()){
    const ms=this.elapsedMs(now);return ms>0?Math.ceil(ms/60000):0;
  }
  start(now=Date.now()){
    if(this.data.running)return false;
    if(!this.data.accumulatedMs&&!this.data.firstStartedAtMs)this.data.firstStartedAtMs=now;
    this.data.startedAtMs=now;this.data.running=true;this.save();return true;
  }
  pause(now=Date.now()){
    if(!this.data.running)return false;
    this.data.accumulatedMs=this.elapsedMs(now);this.data.startedAtMs=null;this.data.running=false;
    this.save();return true;
  }
  reset(){this.data=fresh();this.save();}
}
