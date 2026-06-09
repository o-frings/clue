/* ===========================================================================
   Clue — app engine (vanilla JS, no build step)
   Built on the Yalla blueprint: local-first storage, optional dormant cloud
   sync, an iOS-style swipe-pager UI, and gamification — adapted from "log a
   workout" to "learn a fact". Core loop: Discover → Review (spaced repetition)
   → Quiz. Plus a Library, a Debate mode, and a Me dashboard.
   =========================================================================== */

// ================= tiny helpers =================
const $  = (id) => document.getElementById(id);
const esc = (s) => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DAY = 86400000;
const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
function hashStr(s){ let h=2166136261; s=String(s); for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0); }
function todayStr(d){ d=d||new Date(); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function dayOffsetStr(n){ const d=new Date(); d.setDate(d.getDate()+n); return todayStr(d); }
function fmtDate(ts){ try{ return new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric'}); }catch(e){ return ''; } }
function relDue(ts){ const dd=Math.round((ts-Date.now())/DAY);
  if(dd<=0) return 'now'; if(dd===1) return 'tomorrow'; if(dd<30) return 'in '+dd+' days';
  const m=Math.round(dd/30); return 'in '+m+(m>1?' months':' month'); }

let tT; function toast(m,big){ const t=$("toast"); if(!t) return; t.textContent=m; t.classList.toggle("big",!!big); t.classList.add("show"); clearTimeout(tT); tT=setTimeout(()=>t.classList.remove("show"), big?2600:2100); }
function coach(id,msg){ if(!settings.seenTips) settings.seenTips={};
  if(settings.seenTips[id] || $("coach").classList.contains("show")) return;
  settings.seenTips[id]=1; sset("settings",settings);
  $("coachTxt").textContent=msg; $("coach").classList.add("show"); }
function celebrate(big){
  if(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const N=big?70:46, colors=["#ff7a18","#ff2f3d","#ffd60a","#fb923c","#f5a040","#e8551c","#ff375f"];
  const c=document.createElement("div"); c.className="confetti";
  for(let i=0;i<N;i++){ const s=document.createElement("i");
    s.style.left=Math.random()*100+"%"; s.style.background=colors[i%colors.length];
    s.style.animationDelay=(Math.random()*0.3)+"s";
    s.style.setProperty("--dx",((Math.random()*2-1)*(big?210:150))+"px");
    s.style.setProperty("--sz",(0.7+Math.random()*(big?1.2:0.8)).toFixed(2));
    s.style.setProperty("--dur",(1.3+Math.random()*0.9).toFixed(2)+"s");
    if(Math.random()>.5) s.style.borderRadius="50%"; c.appendChild(s); }
  document.body.appendChild(c); setTimeout(()=>c.remove(), big?2600:2200);
}
function openSheet(s){ const sc=$("scrim"+s), sh=$("sheet"+s); if(sc) sc.classList.add("show"); if(sh) sh.classList.add("show"); }
function closeSheet(s){ const sc=$("scrim"+s), sh=$("sheet"+s); if(sc) sc.classList.remove("show"); if(sh) sh.classList.remove("show"); }

const ICON = {
  source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  deploy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
  counter:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v6h6"/><path d="M21 21v-6h-6"/><path d="M21 9A9 9 0 0 0 6 5.6L3 9M3 15a9 9 0 0 0 15 3.4L21 15"/></svg>',
  lock:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="11" width="15" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
};

// ================= storage (Claude window.storage, else localStorage, else memory) =================
const _mem={};
function hasWS(){ try{ return !!(window.storage && window.storage.get); }catch(e){ return false; } }
function hasLS(){ try{ return !!window.localStorage; }catch(e){ return false; } }
async function sget(k){
  if(hasWS()){ try{ const r=await window.storage.get(k); return r?JSON.parse(r.value):null; }catch(e){ return null; } }
  if(hasLS()){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):null; }catch(e){ return null; } }
  return (k in _mem)?_mem[k]:null;
}
async function sset(k,v){ await _localSet(k,v); cloudMark(k,v); }
async function _localSet(k,v){
  if(hasWS()){ try{ await window.storage.set(k, JSON.stringify(v), false); return; }catch(e){} }
  if(hasLS()){ try{ localStorage.setItem(k, JSON.stringify(v)); return; }catch(e){} }
  _mem[k]=v;
}

// ================= accounts & cloud sync (Supabase) =================
// Same structure as Yalla: localStorage is the live, offline-first store; Supabase is a sync layer
// on top, last-write-wins per key via an updated_at timestamp. Magic-link (email code) auth.
// Feature-flagged: with blank keys the whole layer stays dormant and the app is 100% local.
// To turn it on, fill SUPA.url/key (see ACCOUNTS.md) and run supabase/schema.sql in your project.
const SUPA = { url: "https://giupopvtpthqnidagfsi.supabase.co", key: "sb_publishable_eyYJYRAU3DJLeYNyzofOnw_oFC77BC-" };
const CLOUD_KEYS = ["settings","progress"];     // draft/UI-only keys stay device-local
let sb=null, cloudUser=null, _syncMeta={}, _pushTimers={};

function cloudConfigured(){ return !!(SUPA.url && SUPA.key); }
function cloudReady(){ return !!(sb && cloudUser); }
function cloudAvailable(){ return !!sb; }
async function _persistMeta(){ await _localSet("_syncMeta", _syncMeta); }

// Called once the Supabase SDK script has loaded (index.html invokes window.__cloudInit).
window.__cloudInit = async function(){
  if(sb || !cloudConfigured() || !window.supabase) return;
  try{
    sb = window.supabase.createClient(SUPA.url, SUPA.key, {
      auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    });
  }catch(e){ sb=null; return; }
  _syncMeta = (await sget("_syncMeta")) || {};
  sb.auth.onAuthStateChange((_evt, session)=>{ handleAuth(session && session.user ? session.user : null); });
  try{ const { data } = await sb.auth.getSession(); await handleAuth(data && data.session ? data.session.user : null); }
  catch(e){ await handleAuth(null); }
};

async function handleAuth(user){
  const was = cloudUser && cloudUser.id;
  cloudUser = user || null;
  renderAccount();
  if(cloudUser && cloudUser.id !== was){
    await ensureProfile();
    await cloudReconcile();
    renderAccount();
  }
}

// ---- auth actions (passwordless: email a 6-digit code, then verify) ----
let _lastOtpSend=0;
async function cloudLogin(email){
  if(!sb){ await window.__cloudInit(); }
  if(!sb){ toast("Couldn’t reach the cloud — check your connection."); return; }
  email=(email||"").trim();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast("Enter a valid email address."); return; }
  const wait=Math.ceil((60000-(Date.now()-_lastOtpSend))/1000);
  if(wait>0){ toast("Hold on "+wait+"s before requesting another code."); return; }
  try{
    // Code (not link): a magic link opens Safari and never reaches an installed PWA.
    const { error } = await sb.auth.signInWithOtp({ email, options:{ shouldCreateUser:true } });
    if(error) throw error;
    _lastOtpSend=Date.now(); _pendingEmail=email;
    renderAccount();
    const ci=$("acctCode"); if(ci){ ci.value=""; ci.focus(); }
    toast("Check your email for a 6-digit code.", true);
  }catch(e){ toast("Sign-in failed: "+((e&&e.message)||e)); }
}
let _pendingEmail="";
async function cloudVerify(code){
  if(!sb){ toast("Couldn’t reach the cloud — try again."); return; }
  code=(code||"").replace(/\D/g,"");
  if(code.length<6){ toast("Enter the 6-digit code from your email."); return; }
  try{
    const { error } = await sb.auth.verifyOtp({ email:_pendingEmail, token:code, type:"email" });
    if(error) throw error;
    _pendingEmail="";   // onAuthStateChange takes over from here
  }catch(e){ toast("That code didn’t work — check it or send a new one."); }
}
async function cloudLogout(){
  if(sb){ try{ await sb.auth.signOut(); }catch(e){} }
  cloudUser=null; renderAccount();
  toast("Signed out. Your data stays on this device.");
}

// Make THIS device the source of truth: push every local key up with a fresh timestamp.
async function cloudForcePush(){
  if(!cloudReady()){ toast("Sign in first to save to your account."); return; }
  const now=Date.now(); let n=0;
  for(const k of CLOUD_KEYS){ const v=await sget(k); if(v!=null){ _syncMeta[k]=now; await cloudPush(k,v,now); n++; } }
  await _persistMeta();
  toast(n?"Saved this device’s progress to your account.":"Nothing to save yet.", true);
}
// GDPR: wipe everything this user has in the cloud. Local data is untouched.
async function cloudDeleteData(){
  if(!cloudReady()) return;
  if(!confirm("Delete all your data from the cloud (synced progress + profile)? The copy on this device stays. This can’t be undone.")) return;
  const uid=cloudUser.id;
  try{
    await sb.from("user_data").delete().eq("user_id",uid);
    await sb.from("profiles").delete().eq("user_id",uid);
    _syncMeta={}; await _persistMeta();
    await sb.auth.signOut(); cloudUser=null; renderAccount();
    toast("Your cloud data was deleted. This device is untouched.", true);
  }catch(e){ toast("Couldn’t delete cloud data: "+((e&&e.message)||e)); }
}

async function ensureProfile(){
  if(!cloudReady()) return;
  try{
    const { data } = await sb.from("profiles").select("user_id,display_name").eq("user_id",cloudUser.id).maybeSingle();
    const name = settings.name || (cloudUser.email||"Learner").split("@")[0];
    if(!data) await sb.from("profiles").upsert({ user_id:cloudUser.id, display_name:name });
    else if(!settings.name && data.display_name){ settings.name=data.display_name; await _localSet("settings",settings); }
  }catch(e){}
}

// ---- sync engine (offline-first, last-write-wins per key) ----
// Mark a key dirty and debounce-push it. Called on every sset.
function cloudMark(k,v){
  if(k==="_syncMeta" || !cloudReady() || CLOUD_KEYS.indexOf(k)<0) return;
  _syncMeta[k]=Date.now(); _persistMeta();
  clearTimeout(_pushTimers[k]); const ts=_syncMeta[k];
  _pushTimers[k]=setTimeout(()=>cloudPush(k,v,ts), 1200);
}
async function cloudPush(k,v,ts){
  if(!cloudReady()) return;
  try{
    await sb.from("user_data").upsert(
      { user_id:cloudUser.id, key:k, value:v, updated_at:new Date(ts).toISOString() },
      { onConflict:"user_id,key" });
  }catch(e){ /* left dirty; next change or reconcile retries */ }
}
// On login / launch: pull cloud rows, adopt any newer than local, push any local that are newer/missing.
async function cloudReconcile(){
  if(!cloudReady()) return;
  let rows=[];
  try{ const { data, error } = await sb.from("user_data").select("key,value,updated_at"); if(error) throw error; rows=data||[]; }
  catch(e){ return; }
  const server={}; rows.forEach(r=>{ server[r.key]={ v:r.value, ts:Date.parse(r.updated_at) }; });
  let adopted=false;
  for(const k of CLOUD_KEYS){
    const localTs=_syncMeta[k]||0, s=server[k];
    if(s && s.ts>localTs){ await _localSet(k,s.v); _syncMeta[k]=s.ts; adopted=true; }
    else { const lv=await sget(k); if(lv!=null && (!s || localTs>s.ts)) await cloudPush(k,lv,localTs||Date.now()); }
  }
  await _persistMeta();
  if(adopted) await reloadFromStore();
}
// Re-hydrate the in-memory globals after the sync layer changed storage, then repaint.
async function reloadFromStore(){
  settings = Object.assign(settings, (await sget("settings"))||{});
  progress = (await sget("progress")) || {};
  if(settings.achUnlocked==null) settings.achUnlocked=unlockedIds();
  resetDailyIfNeeded(); session=null;
  applyTheme(); refreshAll(); renderLearn();
}

function renderAccount(){
  const sub=$("acctSub"), body=$("acctBody"); if(!body) return;
  if(!cloudConfigured()){
    sub.textContent=" — local only";
    body.innerHTML='<p class="acctp">Everything is stored privately on this device. To turn on an account and sync your progress across devices, add your Supabase keys — see <b>ACCOUNTS.md</b>. Until then the app is 100% local and offline.</p>';
    return;
  }
  if(cloudReady()){
    sub.textContent=" — synced";
    body.innerHTML=
      '<p class="acctp">Signed in as <b>'+esc(cloudUser.email||"you")+'</b>. Your progress syncs automatically across your devices.</p>'+
      '<button class="btn tinted wide sm" id="acctForce" style="margin-top:6px;">Save this device’s progress now</button>'+
      '<button class="btn plain wide sm" id="acctSignOut" style="margin-top:8px;">Sign out</button>'+
      '<button class="btn red wide sm" id="acctDelete" style="margin-top:2px;">Delete my cloud data</button>';
    $("acctForce").onclick=cloudForcePush;
    $("acctSignOut").onclick=cloudLogout;
    $("acctDelete").onclick=cloudDeleteData;
    return;
  }
  // configured but signed out → email-code login
  sub.textContent=" — sign in to sync";
  const sent=!!_pendingEmail;
  body.innerHTML=
    '<p class="acctp">Sign in to back up your progress and sync it across devices. No password — we email you a 6-digit code.</p>'+
    '<input id="acctEmail" type="email" inputmode="email" autocapitalize="off" autocorrect="off" placeholder="you@email.com" style="margin-top:10px;">'+
    '<button class="btn wide sm" id="acctSend" style="margin-top:10px;">'+(sent?'Resend code':'Email me a code')+'</button>'+
    '<div id="acctCodeRow" style="display:'+(sent?'block':'none')+';margin-top:12px;">'+
      '<input id="acctCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code">'+
      '<button class="btn tinted wide sm" id="acctVerify" style="margin-top:10px;">Verify & sign in</button>'+
    '</div>';
  const em=$("acctEmail"); if(em && _pendingEmail) em.value=_pendingEmail;
  $("acctSend").onclick=()=>cloudLogin(($("acctEmail").value||"").trim());
  const vb=$("acctVerify"); if(vb) vb.onclick=()=>cloudVerify(($("acctCode").value||""));
}

// ================= state =================
let KN = { fields:[], cards:[], motions:[], depths:[] };
let EV = {};                     // evidence registry: id -> {who,year,title,where,url,kind,strength}
let GL = {};                     // glossary registry: id -> {term,symbol,def,field}
let byId={}, byField={}, fieldById={}, depthById={};
let progress = {};               // cardId -> SRS record
let session = null;              // active learn session
let settings = {
  name:"", objective:"everything", focus:[], pace:5, theme:"auto",
  xp:0, streak:0, bestStreak:0, lastSessionDay:"", sessionsDone:0,
  quizCorrectTotal:0, debatesBuilt:0, achUnlocked:null, seenTips:{}, saved:[],
  daily:{ day:"", count:0 }, activity:{}, fotd:null, onboarded:false
};

// ---- progress accessors ----
function getProg(id){ return progress[id]||null; }
function isNew(id){ return !progress[id]; }
function isLearned(id){ const p=progress[id]; return !!(p && p.learned); }
function isDue(id){ const p=progress[id]; return !!(p && p.due<=Date.now()); }
function dueCards(){ return Object.keys(progress).filter(id=>byId[id] && progress[id].due<=Date.now()); }
function learnedIds(){ return Object.keys(progress).filter(id=>byId[id] && progress[id].learned); }
function learnedInField(f){ return learnedIds().filter(id=>byId[id].field===f).length; }

// ================= knowledge load =================
async function loadKnowledge(){
  let data=null;
  try{ const r=await fetch("knowledge.json",{cache:"no-cache"}); data=await r.json(); }
  catch(e){ try{ const r=await fetch("knowledge.json"); data=await r.json(); }catch(e2){ data=null; } }
  if(!data){ return false; }
  KN.fields=data.fields||[]; KN.cards=data.cards||[]; KN.motions=data.motions||[]; KN.depths=data.depths||[];
  // evidence registry (optional, separate file — every source logged once, referenced by card.src[])
  try{ const r=await fetch("evidence.json",{cache:"no-cache"}); const ev=await r.json(); EV=ev.sources||ev||{}; }
  catch(e){ EV={}; }
  // glossary registry (optional, separate file — jargon & canonical symbols)
  try{ const r=await fetch("glossary.json",{cache:"no-cache"}); const gl=await r.json(); GL=gl.terms||gl||{}; }
  catch(e){ GL={}; }
  glossIndex=null;
  byId={}; byField={}; fieldById={}; depthById={};
  KN.fields.forEach(f=>{ fieldById[f.id]=f; byField[f.id]=[]; });
  (KN.depths||[]).forEach(d=> depthById[d.id]=d);
  KN.cards.forEach(c=>{ byId[c.id]=c; if(byField[c.field]) byField[c.field].push(c); });
  return true;
}

// ================= spaced repetition (SM-2 lite) =================
// grade q: 0 again · 1 hard · 2 good · 3 easy. Returns the new record.
function schedule(id, q, firstExposure){
  const now=Date.now();
  let p = progress[id] || { ease:2.5, interval:0, due:now, reps:0, lapses:0, learned:false, seen:now, last:now };
  p.last=now;
  if(q===0){                              // Again — relearn; resurface this session + soon
    if(p.learned) p.lapses++;
    p.reps=0; p.ease=clamp(p.ease-0.2,1.3,2.8); p.interval=0; p.due=now + 60*1000;
  } else {
    p.reps++;
    if(q===1){ p.ease=clamp(p.ease-0.15,1.3,2.8); p.interval = p.reps<=1 ? 1 : Math.max(1, Math.round(p.interval*1.2)); }
    else if(q===2){ p.interval = p.reps<=1 ? 1 : (p.reps===2 ? 3 : Math.round(Math.max(1,p.interval)*p.ease)); }
    else { p.ease=clamp(p.ease+0.15,1.3,2.8); p.interval = p.reps<=1 ? 2 : Math.round(Math.max(1,p.interval)*p.ease*1.3); }
    p.learned=true;
    p.due = now + p.interval*DAY;
  }
  progress[id]=p; return p;
}

// ================= session builder =================
function resetDailyIfNeeded(){
  const d=todayStr();
  if(!settings.daily || settings.daily.day!==d){ settings.daily={ day:d, count:0 }; }
}
function newAllowedToday(){ resetDailyIfNeeded(); return Math.max(0, (settings.pace||5) - settings.daily.count); }

function candidateScore(c){
  let s = 100 - (c.level||1)*8;                                  // easier first
  if((settings.focus||[]).includes(c.field)) s += 40;            // focus fields surface sooner
  if(settings.objective==="debate"){ if(c.deploy) s+=20; if(c.depth==="concept"||c.depth==="book") s+=10; }
  if(settings.objective==="specialise" && (settings.focus||[]).includes(c.field)) s+=30;
  if(settings.objective==="sharp") s += (c.quiz?15:0);
  s += (hashStr(c.id+todayStr())%12);                            // gentle daily shuffle
  return s;
}
function buildDiscoverQueue(limit){
  const cand = KN.cards.filter(c=>isNew(c.id));
  cand.sort((a,b)=> candidateScore(b)-candidateScore(a));
  // for the broad goals, spread across fields: round-robin the sorted list by field
  if(settings.objective==="everything" || settings.objective==="general" || settings.objective==="sharp"){
    const seen={}, out=[], rest=[];
    cand.forEach(c=>{ if(!seen[c.field]){ seen[c.field]=1; out.push(c); } else rest.push(c); });
    return out.concat(rest).slice(0,limit).map(c=>c.id);
  }
  return cand.slice(0,limit).map(c=>c.id);
}
function buildReviewQueue(){
  return dueCards().sort((a,b)=> progress[a].due-progress[b].due).slice(0,40);
}
function buildQuizQueue(){
  const pool = new Set([...(session?session.justLearned:[]), ...learnedIds()]);
  const arr=[...pool].filter(id=> byId[id] && byId[id].quiz);
  arr.sort((a,b)=> (hashStr(a+todayStr())%100)-(hashStr(b+todayStr())%100));
  return arr.slice(0,5);
}
function startSession(){
  const review=buildReviewQueue();
  const discover=buildDiscoverQueue(newAllowedToday());
  session={ phase:null, review, reviewIdx:0, discover, discoverIdx:0, quiz:[], quizIdx:0,
            revealed:false, justLearned:[], answered:null,
            stats:{ learned:0, reviewed:0, quizCorrect:0, quizTotal:0, xp:0 } };
  session.phase = review.length ? 'review' : (discover.length ? 'discover' : (function(){ session.quiz=buildQuizQueue(); return session.quiz.length?'quiz':'done'; })());
  renderLearn();
}
function advancePhase(){
  if(session.phase==='review'){
    if(session.reviewIdx < session.review.length-1){ session.reviewIdx++; session.revealed=false; return; }
    if(session.discover.length){ session.phase='discover'; session.revealed=false; return; }
    session.quiz=buildQuizQueue(); session.phase = session.quiz.length?'quiz':'done'; session.answered=null; return;
  }
  if(session.phase==='discover'){
    if(session.discoverIdx < session.discover.length-1){ session.discoverIdx++; session.revealed=false; return; }
    session.quiz=buildQuizQueue(); session.phase = session.quiz.length?'quiz':'done'; session.answered=null; return;
  }
  if(session.phase==='quiz'){
    if(session.quizIdx < session.quiz.length-1){ session.quizIdx++; session.answered=null; return; }
    session.phase='done'; return;
  }
}

// ================= XP / level / streak / achievements =================
function awardXp(n){ settings.xp=(settings.xp||0)+n; if(session) session.stats.xp+=n; }
function levelFor(xp){ return Math.floor(Math.sqrt((xp||0)/100))+1; }
function levelFloor(L){ return 100*(L-1)*(L-1); }
function levelCeil(L){ return 100*L*L; }
function touchDay(kind){
  const d=todayStr();
  if(settings.lastSessionDay!==d){
    settings.streak = (settings.lastSessionDay===dayOffsetStr(-1)) ? (settings.streak||0)+1 : 1;
    settings.bestStreak=Math.max(settings.bestStreak||0, settings.streak);
    settings.lastSessionDay=d;
  }
  if(!settings.activity) settings.activity={};
  const a = settings.activity[d] || (settings.activity[d]={l:0,r:0,q:0});
  if(kind==='learn') a.l++; else if(kind==='review') a.r++; else if(kind==='quiz') a.q++;
}

const ACHIEVEMENTS=[
  {id:"first",   icon:"🌱", t:"First Fact",   d:"Learn your first card",         test:s=>s.learned>=1},
  {id:"ten",     icon:"🔥", t:"Curious",      d:"Learn 10 cards",                test:s=>s.learned>=10},
  {id:"fifty",   icon:"📚", t:"Well-Read",    d:"Learn 50 cards",                test:s=>s.learned>=50},
  {id:"streak7", icon:"📆", t:"Habit",        d:"7-day streak",                  test:s=>s.best>=7},
  {id:"streak30",icon:"🗓️", t:"Devoted",      d:"30-day streak",                 test:s=>s.best>=30},
  {id:"poly",    icon:"🌐", t:"Polymath",     d:"Learn in every field",          test:s=>s.fields>=s.fieldTotal && s.fieldTotal>0},
  {id:"quiz25",  icon:"⚡", t:"Sharp",        d:"25 quiz answers correct",       test:s=>s.quiz>=25},
  {id:"deep",    icon:"📖", t:"Deep Diver",   d:"Learn a book-depth insight",    test:s=>s.book>=1},
  {id:"debater", icon:"⚖️", t:"Debater",      d:"Build a case in Debate mode",   test:s=>s.debates>=1},
  {id:"level5",  icon:"🎓", t:"Scholar",      d:"Reach level 5",                 test:s=>s.level>=5},
  {id:"steel",   icon:"🛡️", t:"Steelman",     d:"Read 10 counter-arguments",     test:s=>s.counters>=10},
  {id:"focused", icon:"🎯", t:"Focused",      d:"Set a learning objective",      test:s=>s.objSet}
];
function achStats(){
  const lids=learnedIds(); const fieldsTouched=new Set(lids.map(id=>byId[id].field));
  return { learned:lids.length, best:settings.bestStreak||0, fields:fieldsTouched.size, fieldTotal:KN.fields.length,
           quiz:settings.quizCorrectTotal||0, book:lids.filter(id=>byId[id].depth==="book").length,
           debates:settings.debatesBuilt||0, level:levelFor(settings.xp), counters:settings.countersRead||0,
           objSet: (settings.objective && settings.objective!=="everything") || (settings.focus||[]).length>0 };
}
function unlockedIds(){ const s=achStats(); return ACHIEVEMENTS.filter(a=>a.test(s)).map(a=>a.id); }
function checkAchievements(){
  const have=new Set(settings.achUnlocked||[]); const now=unlockedIds();
  const fresh=now.filter(id=>!have.has(id)); settings.achUnlocked=now;
  if(fresh.length){ const a=ACHIEVEMENTS.find(x=>x.id===fresh[0]); celebrate(); toast("Unlocked  "+a.icon+"  "+a.t+(fresh.length>1?"  +"+(fresh.length-1)+" more":""), true); }
  return fresh;
}

// ================= LEARN tab =================
function fieldTag(f){ const fl=fieldById[f]||{label:f,icon:"•",color:"#888"};
  return '<span class="kfieldtag" style="background:'+fl.color+'">'+fl.icon+' '+esc(fl.label)+'</span>'; }
function depthLabel(d){ return (depthById[d]&&depthById[d].label)||d; }

// progressive depth: the Reader peels these open one at a time, starting at the gist.
// New cards carry an explicit `layers` array; older cards fall back to fact → detail.
function layersOf(c){
  const L=[]; const t=(c.fact||c.title||'').trim();
  if(t) L.push({ d:'gist', t:'In one line', body:t });
  if(Array.isArray(c.layers) && c.layers.length){ c.layers.forEach(x=> L.push({ d:x.d||'deeper', t:x.t||'More', body:x.body||'' })); }
  else if(c.detail){ L.push({ d:'basics', t:'The basics', body:c.detail }); }
  return L;
}
function teaser(c){ return c.fact || c.title || ''; }
function paras(s){ return esc(s).split(/\n\n+/).map(p=>'<p>'+p+'</p>').join(''); }

function setSub(){ const obj={everything:"Learn everything",general:"General foundations",specialise:"Specialise",debate:"Debate prep",sharp:"Stay sharp"}[settings.objective]||"";
  const due=dueCards().length, na=newAllowedToday();
  $("lnSub").textContent = obj + (due?(" · "+due+" due"):"") + (na?(" · "+na+" new"):""); }

function renderLearn(){
  setSub();
  const stage=$("lnStage"), bar=$("lnSessBar"), phaseEl=$("lnPhase"), restart=$("lnRestart");
  if(!session){
    bar.style.display="none"; phaseEl.style.display="none"; restart.style.display="none";
    const due=dueCards().length, na=newAllowedToday();
    if(!due && !na && learnedIds().length){
      stage.innerHTML='<div class="emptystate"><div class="ei">✅</div><h3>All caught up</h3><p>No reviews due and you’ve hit today’s new-card target. Come back tomorrow, or raise your pace in <b>Me → Objective</b>.</p><button class="btn wide" id="lnExtra">Learn extra anyway</button></div>';
      $("lnExtra").onclick=()=>{ session={phase:'discover',review:[],reviewIdx:0,discover:buildDiscoverQueue(5),discoverIdx:0,quiz:[],quizIdx:0,revealed:false,justLearned:[],answered:null,stats:{learned:0,reviewed:0,quizCorrect:0,quizTotal:0,xp:0}}; if(!session.discover.length){ session.quiz=buildQuizQueue(); session.phase=session.quiz.length?'quiz':'done'; } renderLearn(); };
      return;
    }
    stage.innerHTML='<div class="emptystate"><div class="ei">📖</div><h3>Today’s session</h3><p>'+
      (due?('<b>'+due+'</b> to review'):'')+(due&&na?' · ':'')+(na?('<b>'+na+'</b> new to discover'):'')+
      (!due&&!na?'Nothing queued — adjust your pace in Me.':'')+'</p><button class="btn wide" id="lnStart">Start</button></div>';
    const sb=$("lnStart"); if(sb) sb.onclick=startSession;
    return;
  }
  restart.style.display="block"; restart.textContent="end";
  if(session.phase==='done'){ bar.style.display="none"; phaseEl.style.display="none"; return renderDone(); }

  bar.style.display="flex"; phaseEl.style.display="block";
  const total=session.review.length+session.discover.length+session.quiz.length;
  const done=session.reviewIdx + (session.phase!=='review'?session.review.length:0)
           + (session.phase==='discover'?session.discoverIdx:(session.phase==='quiz'||session.phase==='done'?session.discover.length:0))
           + (session.phase==='quiz'?session.quizIdx:0);
  $("lnProg").style.width = (total? Math.round(done/total*100):0)+"%";
  $("lnCount").textContent = Math.min(done+1,total)+"/"+total;
  phaseEl.textContent = session.phase==='review'?'Review':(session.phase==='discover'?'Discover':'Quiz');

  if(session.phase==='quiz') return renderQuiz();
  // review or discover → a card
  const id = session.phase==='review' ? session.review[session.reviewIdx] : session.discover[session.discoverIdx];
  renderCardPlayer(byId[id], session.phase);
}

function renderCardPlayer(c, mode){
  const back = session.revealed ? `
    <div class="kback">
      <div class="kdetail">${esc(c.detail)}</div>
      ${sourceLine(c)}
      ${debateBox(c)}
    </div>` : '';
  const controls = !session.revealed
    ? `<div class="kreveal"><button class="btn wide" id="lnReveal">${mode==='review'?'Show answer':'Reveal'}</button></div>`
    : (mode==='review'
        ? `<div class="grades">
             <button class="grade again" data-q="0"><b>Again</b><span>&lt;1d</span></button>
             <button class="grade hard"  data-q="1"><b>Hard</b><span>soon</span></button>
             <button class="grade good"  data-q="2"><b>Good</b><span>${schedPeek(c,2)}</span></button>
             <button class="grade easy"  data-q="3"><b>Easy</b><span>${schedPeek(c,3)}</span></button>
           </div>`
        : `<div class="row" style="margin-top:4px;">
             <button class="btn tinted wide" id="lnKnew">Knew it</button>
             <button class="btn wide" id="lnGot">Got it →</button>
           </div>`);
  $("lnStage").innerHTML = `
    <div class="cardstage"><div class="kcard">
      <div class="ktop">${fieldTag(c.field)}<span class="kdepth">${esc(depthLabel(c.depth))}</span><span class="klevel">L${c.level||1}</span></div>
      <div class="kfact">${esc(c.fact)}</div>
      ${c.year?('<div class="kyear">'+c.year+'</div>'):''}
      ${back}
      ${controls}
    </div></div>`;
  if(!session.revealed){ $("lnReveal").onclick=()=>{ session.revealed=true; renderLearn(); }; return; }
  if(mode==='review'){
    document.querySelectorAll("#lnStage .grade").forEach(b=> b.onclick=()=>gradeCurrent(+b.dataset.q));
  } else {
    $("lnGot").onclick=()=>discoverCurrent(2);
    $("lnKnew").onclick=()=>discoverCurrent(3);
  }
}
function schedPeek(c,q){ const cur=progress[c.id]; const save=cur?JSON.parse(JSON.stringify(cur)):null;
  const p=schedule(c.id,q,true); const days=p.interval; if(save) progress[c.id]=save; else delete progress[c.id];
  return days>=1?(days+'d'):'soon'; }
// resolve a card's sources from the evidence registry (falls back to a legacy inline source)
function cardSources(c){
  if(Array.isArray(c.src)) return c.src.map(id=>EV[id]).filter(Boolean);
  if(c.source) return [c.source];
  return [];
}
function cardSourceText(c){ return cardSources(c).map(s=>(s.who||'')+' '+(s.title||'')).join(' '); }
function fmtSource(s){
  const bits=[]; if(s.who) bits.push(esc(s.who)); if(s.year) bits.push(s.year);
  let txt=bits.join(', '); if(s.title) txt+= (txt?' — ':'')+'<i>'+esc(s.title)+'</i>'; if(s.where) txt+=', '+esc(s.where);
  if(s.url) txt='<a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+txt+'</a>';
  if(s.strength) txt+=' <span class="ksrcstr">· '+esc(s.strength)+'</span>';
  return txt;
}
function sourceLine(c){
  const srcs=cardSources(c).filter(s=> s.who||s.title);
  if(!srcs.length) return '';
  return '<div class="ksource">'+ICON.source+'<span>'+srcs.map(fmtSource).join('<br>')+'</span></div>';
}
function debateBox(c){ if(!c.deploy && !c.counter) return '';
  return '<div class="kdebate">'+
    (c.deploy?('<div class="karg deploy"><div class="klabel">'+ICON.deploy+'Use it</div><p>'+esc(c.deploy)+'</p></div>'):'')+
    (c.counter?('<div class="karg counter"><div class="klabel">'+ICON.counter+'But…</div><p>'+esc(c.counter)+'</p></div>'):'')+
    '</div>'; }

// media slots: schema v3 {type:'equation'|'image'|'figure'|'map', tex|src, caption, alt}.
// Equations show as plain TeX for now — KaTeX rendering arrives in Phase 2.
function mediaHtml(c){
  if(!Array.isArray(c.media) || !c.media.length) return '';
  return c.media.map(m=>{
    if(!m || !m.type) return '';
    if(m.type==='equation'){ const tex=m.tex||m.body||'', plain=m.plain||tex;
      return '<div class="kmedia eq"><span class="katexeq" data-tex="'+esc(tex)+'" data-display="1">'+esc(plain)+'</span>'+(m.caption?'<div class="kmcap">'+esc(m.caption)+'</div>':'')+'</div>'; }
    if(m.type==='image'||m.type==='figure'||m.type==='map'){ if(!m.src) return '';
      return '<figure class="kmedia"><img src="'+esc(m.src)+'" alt="'+esc(m.alt||m.caption||'')+'" loading="lazy">'+(m.caption?'<figcaption>'+esc(m.caption)+'</figcaption>':'')+'</figure>'; }
    return '';
  }).join('');
}
// cross-reference web: prereq (what this builds on) + xref (what it connects to)
function cardLinkChip(id){ const t=byId[id]; if(!t) return ''; const fl=fieldById[t.field]||{};
  return '<button class="rdrel" data-id="'+esc(id)+'" style="--fc:'+(fl.color||'#888')+'">'+(fl.icon?esc(fl.icon)+' ':'')+esc(t.title)+'</button>'; }
function relatedHtml(c){
  const pre=(c.prereq||[]).filter(id=>byId[id]);
  const xr=(c.xref||[]).filter(id=>byId[id]&&id!==c.id);
  let h='';
  if(pre.length) h+='<div class="rdrelblock"><div class="rdrelh">Builds on</div><div class="rdrelrow">'+pre.map(cardLinkChip).join('')+'</div></div>';
  if(xr.length) h+='<div class="rdrelblock"><div class="rdrelh">Connects to</div><div class="rdrelrow">'+xr.map(cardLinkChip).join('')+'</div></div>';
  return h;
}

// ================= glossary tooltips (Phase 2) =================
// Wrap the first occurrence of each known glossary term/symbol in rendered text
// with a tappable chip that opens a definition popover. Pure DOM pass — safe against
// the already-escaped HTML, and conservative (one link per term per render).
let glossIndex=null;
function buildGlossIndex(){
  const entries=[];
  for(const id in GL){ const g=GL[id]||{};
    if(g.term) entries.push({id, text:g.term, sym:false});
    if(g.symbol) entries.push({id, text:g.symbol, sym:true}); }
  entries.sort((a,b)=> b.text.length-a.text.length); // longest first so "GDP" wins over "GD"
  glossIndex=entries;
}
function decorateGlossary(root){
  if(!root) return;
  if(!glossIndex) buildGlossIndex();
  if(!glossIndex.length) return;
  const used=new Set();
  const walker=document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(n){
    if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
    const p=n.parentElement;
    if(!p || p.closest('a,button,.glossterm,.rdLabel,.rdField,.kmedia,.ksource,.rdrel,.katex')) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT; } });
  const nodes=[]; let n; while((n=walker.nextNode())) nodes.push(n);
  for(const node of nodes){
    const text=node.nodeValue;
    let best=null;
    for(const e of glossIndex){
      if(used.has(e.id)) continue;
      let idx;
      if(e.sym) idx=text.indexOf(e.text);
      else { const m=text.match(new RegExp('\\b'+escRe(e.text)+'\\b','i')); idx=m?m.index:-1; }
      if(idx>=0 && (!best || idx<best.idx)) best={e, idx};
    }
    if(!best) continue;
    const {e, idx}=best, len=e.text.length;
    const span=document.createElement('button'); span.className='glossterm'; span.dataset.gl=e.id; span.textContent=text.slice(idx,idx+len);
    const frag=document.createDocumentFragment();
    if(idx>0) frag.appendChild(document.createTextNode(text.slice(0,idx)));
    frag.appendChild(span);
    if(idx+len<text.length) frag.appendChild(document.createTextNode(text.slice(idx+len)));
    node.parentNode.replaceChild(frag, node);
    used.add(e.id);
  }
  root.querySelectorAll('.glossterm').forEach(b=> b.onclick=(ev)=>{ ev.stopPropagation(); showGloss(b.dataset.gl, b); });
}
function showGloss(id, anchor){
  const g=GL[id]; if(!g) return;
  const fl=fieldById[g.field]||{};
  let pop=$("glossPop");
  if(!pop){ pop=document.createElement('div'); pop.id='glossPop'; pop.className='glosspop'; document.body.appendChild(pop);
    pop.addEventListener('click', e=>e.stopPropagation()); }
  pop.style.setProperty('--fc', fl.color||'var(--accent)');
  pop.innerHTML='<div class="gpterm">'+(g.symbol?('<span class="gpsym">'+esc(g.symbol)+'</span>'):'')+esc(g.term)+'</div><div class="gpdef">'+esc(g.def||'')+'</div>';
  const pw=Math.min(300, window.innerWidth-24);
  pop.style.width=pw+'px'; pop.style.display='block';
  const r=anchor.getBoundingClientRect();
  const left=clamp(r.left+r.width/2-pw/2, 12, window.innerWidth-pw-12);
  pop.style.left=left+'px';
  const ph=pop.offsetHeight;
  const below=r.bottom+8, above=r.top-8-ph;
  pop.style.top=(below+ph>window.innerHeight-12 && above>12 ? above : below)+'px';
  setTimeout(()=> document.addEventListener('click', dismissGloss, {once:true}), 0);
}
function dismissGloss(){ const p=$("glossPop"); if(p) p.style.display='none'; }

// ================= math rendering (Phase 2, KaTeX — progressive enhancement) =================
// Renders media equation slots and \(...\)/$$...$$/\[...\] delimiters in prose.
// Single-$ is intentionally NOT a delimiter (it collides with dollar amounts).
function renderMath(root){
  if(!root) return;
  if(window.katex){ root.querySelectorAll('.katexeq[data-tex]').forEach(el=>{
    if(el.dataset.rendered) return;
    try{ window.katex.render(el.dataset.tex, el, {throwOnError:false, displayMode: el.dataset.display==='1'}); el.dataset.rendered='1'; }catch(e){}
  }); }
  if(window.renderMathInElement){ try{ window.renderMathInElement(root, {
    delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false}],
    throwOnError:false, ignoredTags:['script','noscript','style','textarea','pre','code','button']
  }); }catch(e){} }
}
// re-render the open Reader once KaTeX finishes loading after the fact
window.__mathReady=()=>{ if(rdId) renderMath($("rdBody")); };

function gradeCurrent(q){
  const id=session.review[session.reviewIdx]; schedule(id,q,false);
  session.stats.reviewed++; touchDay('review');
  awardXp(q===0?2:(q===1?6:(q===2?10:12)));
  if(q===0){ session.review.push(id); }           // resurface later this session
  if(q>=2 && !session.justLearned.includes(id)) session.justLearned.push(id);
  afterCardAction();
}
function discoverCurrent(q){
  const id=session.discover[session.discoverIdx]; const wasNew=isNew(id);
  schedule(id,q,true);
  if(wasNew){ resetDailyIfNeeded(); settings.daily.count++; session.stats.learned++; touchDay('learn'); }
  session.justLearned.push(id); awardXp(q===3?6:10);
  afterCardAction();
}
function afterCardAction(){ advancePhase(); persistAll(); checkAchievements(); renderLearn(); }

function renderQuiz(){
  const id=session.quiz[session.quizIdx], c=byId[id], qz=c.quiz;
  const ans=session.answered;
  const opts=qz.choices.map((opt,i)=>{
    let cls="quizopt"; let mark="";
    if(ans!=null){ if(i===qz.answer){ cls+=" correct"; mark='<span class="qmark">✓</span>'; }
      else if(i===ans){ cls+=" wrong"; mark='<span class="qmark">✕</span>'; } else cls+=" muted"; }
    return '<button class="'+cls+'" data-i="'+i+'"'+(ans!=null?' disabled':'')+'>'+esc(opt)+mark+'</button>';
  }).join('');
  $("lnStage").innerHTML=`
    <div class="cardstage"><div class="kcard">
      <div class="ktop">${fieldTag(c.field)}<span class="kdepth">Quiz</span></div>
      <div class="quizq">${esc(qz.q)}</div>
      <div class="quizopts">${opts}</div>
      ${ans!=null?('<div class="kback" style="margin-top:16px;padding-top:16px;"><div class="kdetail">'+esc(c.detail)+'</div>'+sourceLine(c)+'</div><button class="btn wide" id="qzNext" style="margin-top:16px;">'+(session.quizIdx<session.quiz.length-1?'Next':'Finish')+'</button>'):''}
    </div></div>`;
  if(ans==null){ document.querySelectorAll("#lnStage .quizopt").forEach(b=> b.onclick=()=>answerQuiz(+b.dataset.i)); }
  else { $("qzNext").onclick=()=>{ advancePhase(); renderLearn(); }; }
}
function answerQuiz(i){
  const id=session.quiz[session.quizIdx], c=byId[id]; const correct = i===c.quiz.answer;
  session.answered=i; session.stats.quizTotal++; touchDay('quiz');
  if(correct){ session.stats.quizCorrect++; settings.quizCorrectTotal=(settings.quizCorrectTotal||0)+1; awardXp(8); }
  else { awardXp(2); if(progress[id]) schedule(id,1,false); }   // miss → review sooner
  persistAll(); checkAchievements(); renderLearn();
}
function renderDone(){
  const st=session.stats;
  settings.sessionsDone=(settings.sessionsDone||0)+1; persistAll(); celebrate(true);
  $("lnStage").innerHTML=`<div class="emptystate"><div class="ei">🎉</div><h3>Session complete</h3>
    <p>+${st.xp} XP · ${st.learned} learned · ${st.reviewed} reviewed${st.quizTotal?(' · '+st.quizCorrect+'/'+st.quizTotal+' quiz'):''}</p>
    <button class="btn wide" id="lnAgain">Done</button></div>`;
  $("lnAgain").onclick=()=>{ session=null; renderLearn(); showTab('feed'); };
}

// ================= TODAY =================
function greeting(){ const h=new Date().getHours(); const t=h<12?'Good morning':(h<18?'Good afternoon':'Good evening');
  return settings.name? (t+', '+esc(settings.name)) : t; }
function factOfDay(){ const d=todayStr();
  if(settings.fotd && settings.fotd.day===d && byId[settings.fotd.id]) return byId[settings.fotd.id];
  if(!KN.cards.length) return null;
  const idx=hashStr(d)%KN.cards.length; const c=KN.cards[idx];
  settings.fotd={day:d, id:c.id}; return c; }
// ================= FEED (explore) =================
let feedFilter="all";   // "all" or a field id
let feedStatus="all";   // "all" | "unlearned" | "learned"
let feedOrder=[];       // current visible order, for the Reader's "next"

function feedCandidates(){
  let list=KN.cards.slice();
  if(feedFilter!=="all") list=list.filter(c=>c.field===feedFilter);
  if(feedStatus==="learned") list=list.filter(c=>isLearned(c.id));
  else if(feedStatus==="unlearned") list=list.filter(c=>!isLearned(c.id));
  // basics first, with a gentle daily shuffle so the feed feels fresh and fields mix
  list.sort((a,b)=> ((a.level||1)-(b.level||1)) || ((hashStr(a.id+todayStr())%97)-(hashStr(b.id+todayStr())%97)) );
  return list;
}
function renderFeed(){
  $("feedSub").textContent = greeting()+" — what do you want to understand today?";
  renderFeedStrip(); renderFeedFilter(); renderFeedStatus(); renderFeedList();
}
function renderFeedStatus(){
  document.querySelectorAll("#feedStatus .s").forEach(s=>{
    s.classList.toggle("active", s.dataset.s===feedStatus);
    s.onclick=()=>{ feedStatus=s.dataset.s; renderFeedStatus(); renderFeedList(); };
  });
}
function renderFeedStrip(){
  const streak=settings.streak||0, due=dueCards().length, na=newAllowedToday(), saved=(settings.saved||[]).length;
  const items=[
    { k:'session', emoji:(due+na)?'📚':'✅', big:(due+na)?String(due+na):'0', sub:(due+na)?'to learn':'all done' },
    { k:'streak',  emoji:'🔥', big:String(streak), sub:'day'+(streak===1?'':'s') },
    { k:'surprise',emoji:'🎲', big:'?', sub:'surprise me' },
    { k:'saved',   emoji:'🔖', big:String(saved), sub:'saved' }
  ];
  $("feedStrip").innerHTML=items.map(it=>
    '<button class="story s-'+it.k+'" data-k="'+it.k+'"><span class="storyio">'+it.emoji+'</span>'+
    '<span class="storybig">'+esc(it.big)+'</span><span class="storysub">'+esc(it.sub)+'</span></button>').join('');
  document.querySelectorAll("#feedStrip .story").forEach(b=> b.onclick=()=>feedStripTap(b.dataset.k));
}
function feedStripTap(k){
  if(k==='session'||k==='streak'){ showTab('learn'); if(!session) startSession(); }
  else if(k==='surprise'){ if(KN.cards.length){ const c=KN.cards[hashStr(String(Date.now())+Math.floor(Math.random()*9999))%KN.cards.length]; feedReaderList=[]; openReader(c.id); } }
  else if(k==='saved'){
    const ids=(settings.saved||[]); if(!ids.length){ toast("Tap 🔖 in a card to save it for later"); return; }
    feedReaderList = ids.slice(); openReader(ids[0]);
  }
}
function renderFeedFilter(){
  const chips=[{id:"all",label:"For you",icon:"✨"}].concat(KN.fields.map(f=>({id:f.id,label:f.label,icon:f.icon})));
  $("feedFilter").innerHTML=chips.map(f=>'<button class="chip'+(feedFilter===f.id?' on':'')+'" data-f="'+f.id+'">'+(f.icon?esc(f.icon)+' ':'')+esc(f.label)+'</button>').join('');
  document.querySelectorAll("#feedFilter .chip").forEach(ch=> ch.onclick=()=>{ feedFilter=ch.dataset.f; renderFeedFilter(); renderFeedList(); });
}
function feedCardHtml(c, featured){
  const fl=fieldById[c.field]||{}, col=fl.color||'#888';
  const depthN=layersOf(c).length, st=cardState(c.id);
  const saved=(settings.saved||[]).includes(c.id);
  const isTheory = c.depth==='concept'||c.depth==='book';
  return '<button class="fcard'+(featured?' feat':'')+'" data-id="'+c.id+'" style="--fc:'+col+';">'+
    '<div class="fctop"><span class="fcfield">'+(fl.icon?esc(fl.icon)+' ':'')+esc(fl.label||'')+'</span>'+
      (isTheory?'<span class="fctag">theory</span>':'')+
      (saved?'<span class="fcsaved">🔖</span>':'')+'</div>'+
    '<div class="fctitle">'+esc(c.title)+'</div>'+
    '<div class="fchook">'+esc(teaser(c))+'</div>'+
    '<div class="fcfoot"><span class="fcdepth">▽ '+depthN+' level'+(depthN===1?'':'s')+'</span>'+
      '<span class="fcstate '+st.cls+'">'+st.txt+'</span></div>'+
    '</button>';
}
function renderFeedList(){
  const list=feedCandidates();
  feedOrder=list.map(c=>c.id);
  if(!list.length){ $("feedList").innerHTML='<div class="emptystate"><div class="ei">🔍</div><p>Nothing here yet.</p></div>'; return; }
  let html=''; list.forEach((c,i)=> html+=feedCardHtml(c, i===0 && feedFilter==='all'));
  $("feedList").innerHTML=html;
  document.querySelectorAll("#feedList .fcard").forEach(el=> el.onclick=()=>{ feedReaderList=feedOrder.slice(); openReader(el.dataset.id); });
}

// ================= LIBRARY =================
let libFieldFilter="all", libQuery="";
function openLibrary(){ renderLibChips(); renderLibList(); openSheet("Library"); }
function renderLibChips(){
  const chips=[{id:"all",label:"All",icon:"•"}].concat(KN.fields);
  $("libFieldChips").innerHTML=chips.map(f=>'<button class="chip'+(libFieldFilter===f.id?' on':'')+'" data-f="'+f.id+'">'+(f.icon?esc(f.icon)+' ':'')+esc(f.label)+'</button>').join('');
  document.querySelectorAll("#libFieldChips .chip").forEach(ch=> ch.onclick=()=>{ libFieldFilter=ch.dataset.f; renderLibChips(); renderLibList(); });
}
function cardState(id){ if(isNew(id)) return {cls:"new",txt:"New"}; if(isDue(id)) return {cls:"due",txt:"Due"}; return {cls:"learned",txt:"Learned"}; }
function renderLibList(){
  const q=libQuery.trim().toLowerCase();
  let list=KN.cards.filter(c=> libFieldFilter==="all" || c.field===libFieldFilter);
  if(q){ list=list.filter(c=> (c.title+' '+c.fact+' '+(c.detail||'')+' '+cardSourceText(c)+' '+(c.tags||[]).join(' ')).toLowerCase().includes(q)); }
  if(!list.length){ $("libList").innerHTML='<div class="emptystate"><div class="ei">🔍</div><p>No cards match.</p></div>'; return; }
  $("libList").innerHTML=list.map(c=>{ const fl=fieldById[c.field]||{}, st=cardState(c.id);
    return '<div class="libcard" data-id="'+c.id+'"><span class="lcdot" style="background:'+(fl.color||'#888')+'"></span>'+
      '<div class="lcinfo"><div class="lctitle">'+esc(c.title)+'</div><div class="lcmeta">'+esc(fl.label||'')+' · '+esc(depthLabel(c.depth))+'</div></div>'+
      '<span class="lcstate '+st.cls+'">'+st.txt+'</span></div>'; }).join('');
  document.querySelectorAll("#libList .libcard").forEach(r=> r.onclick=()=>openCard(r.dataset.id));
}

// ================= IMMERSIVE READER (peel-to-deepen) =================
let rdId=null, rdRevealed=1, feedReaderList=[];

function openReader(id){
  const c=byId[id]; if(!c) return;
  rdId=id; rdRevealed=1;
  if(!feedReaderList.length) feedReaderList = feedOrder.length? feedOrder.slice() : KN.cards.map(x=>x.id);
  if(feedReaderList.indexOf(id)<0) feedReaderList.unshift(id);
  renderReader();
  const r=$("reader"); r.classList.add("show"); r.setAttribute("aria-hidden","false");
  document.body.classList.add("reading"); $("rdBody").scrollTop=0;
}
function closeReader(){ const r=$("reader"); r.classList.remove("show"); r.setAttribute("aria-hidden","true");
  document.body.classList.remove("reading"); rdId=null; refreshAll(); }
function readerNext(){ const i=feedReaderList.indexOf(rdId); let n=(i>=0?i+1:0); if(n>=feedReaderList.length) n=0; openReader(feedReaderList[n]); }

function renderReader(){
  const c=byId[rdId]; if(!c) return;
  const fl=fieldById[c.field]||{}, col=fl.color||'#888';
  const layers=layersOf(c), total=layers.length;
  rdRevealed=clamp(rdRevealed,1,total);
  $("rdHead").style.setProperty('--fc',col);
  $("rdProg").innerHTML=layers.map((l,i)=>'<span class="rddot'+(i<rdRevealed?' on':'')+'"></span>').join('');
  $("rdSave").classList.toggle("on",(settings.saved||[]).includes(rdId));

  let body='<div class="rdField" style="--fc:'+col+'">'+(fl.icon?esc(fl.icon)+' ':'')+esc(fl.label||'')+(c.year?(' · '+c.year):'')+'</div>';
  body+='<h1 class="rdTitle">'+esc(c.title)+'</h1>';
  for(let i=0;i<rdRevealed;i++){ const l=layers[i];
    body+='<div class="rdLayer d-'+esc(l.d||'')+'"><div class="rdLabel">'+esc(l.t||'')+'</div>'+paras(l.body||'')+'</div>'; }
  // once every layer is open, the source / "use it & contest it" box / quiz / actions live in the scroll
  if(rdRevealed>=total){
    body+='<div class="rdEnd">'+mediaHtml(c)+sourceLine(c)+debateBox(c)+relatedHtml(c)+'</div>';
    if(c.quiz) body+='<button class="btn tinted wide sm" id="rdQuiz" style="margin-top:12px;">Quick check ⚡</button>';
    if(isNew(rdId)) body+='<button class="btn wide" id="rdLearn" style="margin-top:10px;">＋ Add to my learning</button>';
    else body+='<div class="rddone">'+(isLearned(rdId)?('✓ In your deck · next review '+relDue(progress[rdId].due)):'In progress')+'</div>';
    body+='<button class="btn plain wide sm" id="rdNext" style="margin-top:6px;">Next concept →</button>';
  }
  $("rdBody").innerHTML=body;
  // tap anywhere on the card to peel the next layer (links / buttons excepted)
  $("rdBody").onclick = (rdRevealed<total) ? (e=>{ if(e.target.closest('a')||e.target.closest('button')) return; rdRevealed++; renderReader(); }) : null;
  renderMath($("rdBody"));
  decorateGlossary($("rdBody"));
  // related-card chips (prereq / xref) navigate the reader to that card
  document.querySelectorAll("#rdBody .rdrel").forEach(b=> b.onclick=(e)=>{ e.stopPropagation(); openReader(b.dataset.id); });
  // foot: a persistent "go deeper" affordance while peeling; empty once fully open
  $("rdFoot").innerHTML = (rdRevealed<total)
    ? '<button class="btn wide rddeeper" id="rdDeeper"><span>Go deeper</span><span class="rddsub">'+esc(layers[rdRevealed].t||'')+' · '+(rdRevealed+1)+' of '+total+'</span></button>'
    : '';
  const dp=$("rdDeeper"); if(dp) dp.onclick=()=>{ rdRevealed++; renderReader(); };
  const lr=$("rdLearn"); if(lr) lr.onclick=()=>{ schedule(rdId,2,true); resetDailyIfNeeded(); settings.daily.count++; touchDay('learn'); awardXp(10); persistAll(); checkAchievements(); celebrate(); toast("Added — "+esc(c.title)); renderReader(); };
  const nn=$("rdNext"); if(nn) nn.onclick=readerNext;
  const qz=$("rdQuiz"); if(qz) qz.onclick=()=>readerQuiz(c);
}
function readerQuiz(c){
  const qz=c.quiz; if(!qz) return; let answered=null;
  function draw(){
    const opts=qz.choices.map((opt,i)=>{ let cls="quizopt", mark="";
      if(answered!=null){ if(i===qz.answer){cls+=" correct"; mark='<span class="qmark">✓</span>';} else if(i===answered){cls+=" wrong"; mark='<span class="qmark">✕</span>';} else cls+=" muted"; }
      return '<button class="'+cls+'" data-i="'+i+'"'+(answered!=null?' disabled':'')+'>'+esc(opt)+mark+'</button>'; }).join('');
    $("rdFoot").innerHTML='';
    $("rdBody").onclick=null;
    $("rdBody").innerHTML='<div class="rdField" style="--fc:'+((fieldById[c.field]||{}).color||'#888')+'">Quick check ⚡</div>'+
      '<div class="rdquiz"><div class="quizq">'+esc(qz.q)+'</div><div class="quizopts">'+opts+'</div>'+
      (answered!=null?'<button class="btn wide sm" id="rdQzBack" style="margin-top:14px;">Back to card</button>':'')+'</div>';
    if(answered==null){ document.querySelectorAll("#rdBody .quizopt").forEach(b=> b.onclick=()=>{ answered=+b.dataset.i;
      if(answered===qz.answer){ settings.quizCorrectTotal=(settings.quizCorrectTotal||0)+1; awardXp(8); touchDay('quiz'); persistAll(); checkAchievements(); celebrate(); }
      draw(); }); }
    else { $("rdBody").scrollTop=0; $("rdQzBack").onclick=()=>{ rdRevealed=layersOf(c).length; renderReader(); }; }
  }
  draw();
}
function toggleSave(){ if(!rdId) return; settings.saved=settings.saved||[]; const i=settings.saved.indexOf(rdId);
  if(i>=0){ settings.saved.splice(i,1); toast("Removed from saved"); } else { settings.saved.push(rdId); toast("Saved 🔖"); }
  persistAll(); renderReader(); }
function shareCard(){ const c=byId[rdId]; if(!c) return; const text=c.title+' — '+teaser(c)+'  · via Clue';
  try{ if(navigator.share){ navigator.share({title:c.title, text}); return; } }catch(e){}
  try{ if(navigator.clipboard){ navigator.clipboard.writeText(text).then(()=>toast("Copied to clipboard")); return; } }catch(e){}
  toast("Share: "+c.title); }

// keep older call sites working — every card opens in the immersive reader now
function openCard(id){ feedReaderList=[]; openReader(id); }

// ================= DEBATE =================
let dbMotion=null, dbSide="for";
function renderDebate(){
  if(!dbMotion){
    $("dbTitle").textContent="Debate"; $("dbSub").textContent="Pick a motion to build your case.";
    $("dbBack").style.cursor="default";
    $("dbBody").innerHTML='<div class="ed-label">Motions</div>'+ KN.motions.map(m=>
      '<div class="motionpick" data-m="'+m.id+'"><span class="mpt">'+esc(m.text)+'</span><span class="mpchev">›</span></div>').join('')
      + '<div class="foot">Each side is built from the facts in your library. Learn cards in the relevant fields to unlock stronger, sourced points.</div>';
    document.querySelectorAll("#dbBody .motionpick").forEach(el=> el.onclick=()=>pickMotion(el.dataset.m));
    return;
  }
  const m=KN.motions.find(x=>x.id===dbMotion); if(!m){ dbMotion=null; return renderDebate(); }
  $("dbTitle").textContent="‹ Motions"; $("dbBack").style.cursor="pointer"; $("dbSub").textContent="Tap a point to read the full card.";
  const pool=KN.cards.filter(c=> (m.fields||[]).includes(c.field) && (c.deploy||c.counter));
  // learned first, then by level
  pool.sort((a,b)=> (isLearned(b.id)-isLearned(a.id)) || ((a.level||1)-(b.level||1)));
  const side=dbSide;
  const items=pool.map(c=>{
    const locked=!isLearned(c.id); const body = side==="for"? c.deploy : c.counter; if(!body) return '';
    return '<div class="argcard '+side+'" data-id="'+c.id+'">'+
      '<div class="actitle">'+esc(c.title)+'</div>'+
      '<div class="acbody">'+(locked?'<span style="filter:blur(4px)">'+esc(body)+'</span>':esc(body))+'</div>'+
      (locked?('<div class="aclock">'+ICON.lock+'Learn this card to unlock</div>'):(function(){ const s0=cardSources(c)[0]||{}; return '<div class="acsrc">'+esc(s0.who||'')+(s0.year?(', '+s0.year):'')+'</div>'; })())+
      '</div>'; }).join('');
  $("dbBody").innerHTML=`
    <div class="motioncard"><div class="mk">Motion</div><div class="mt">${esc(m.text)}</div></div>
    <div class="seg" id="dbSideSeg"><div class="s${side==='for'?' active':''}" data-side="for">Arguments for</div><div class="s${side==='against'?' active':''}" data-side="against">Against / rebuttal</div></div>
    <div class="steelman"><div class="smk">${side==='for'?'Make your case':'Steelman the other side'}</div><p>${side==='for'?'Lead with your strongest sourced point, then stack support. The opponent will attack your weakest link — pick points you can defend.':'Before you argue, state the other side as strongly as they would. Anticipating these is how you win the rebuttal.'}</p></div>
    ${items||'<div class="emptystate"><div class="ei">📭</div><p>No cards in this motion’s fields yet.</p></div>'}`;
  document.querySelectorAll("#dbSideSeg .s").forEach(s=> s.onclick=()=>{ dbSide=s.dataset.side; if(dbSide==='against'){ settings.countersRead=(settings.countersRead||0)+ pool.filter(c=>c.counter && isLearned(c.id)).length; persistAll(); checkAchievements(); } renderDebate(); });
  document.querySelectorAll("#dbBody .argcard").forEach(el=> el.onclick=()=>openCard(el.dataset.id));
}
function pickMotion(id){ dbMotion=id; dbSide="for"; settings.debatesBuilt=(settings.debatesBuilt||0)+1; awardXp(5); persistAll(); checkAchievements(); renderDebate(); }

// ================= ME =================
function renderMe(){
  // profile
  const initials=(settings.name||'').trim().split(/\s+/).filter(Boolean).map(s=>s[0]).slice(0,2).join('').toUpperCase()||'🙂';
  $("meProfile").innerHTML='<div class="pcav">'+esc(initials)+'</div><div style="flex:1;min-width:0;"><div class="pcname">'+(esc(settings.name)||'Set your name')+'</div><div class="pchint">Level '+levelFor(settings.xp)+' · '+(settings.xp||0)+' XP</div></div>';
  $("meProfile").onclick=()=>{ openSheet("Settings"); };
  // stats
  $("stLevel").textContent=levelFor(settings.xp);
  $("stLearned").textContent=learnedIds().length;
  $("stStreak").textContent=settings.streak||0;
  const due=dueCards().length; $("stDue").textContent=due; $("stDue").classList.toggle("due",due>0);
  // xp bar
  const L=levelFor(settings.xp), lo=levelFloor(L), hi=levelCeil(L);
  $("xpBar").style.width = clamp((settings.xp-lo)/(hi-lo)*100,2,100)+"%";
  $("stXpToGo").textContent = '· '+(hi-(settings.xp||0))+' XP to level '+(L+1);
  // radar + chart
  drawFieldRadar(); drawProgress();
  $("meRadarFoot").textContent = (learnedIds().length? (new Set(learnedIds().map(id=>byId[id].field)).size+' of '+KN.fields.length+' fields started') : 'Learn cards to grow your field balance.')+' · Tap to see the breakdown.';
  const wk=lastNDaysActivity(14).reduce((a,d)=>a+d.l,0);
  $("meProgFoot").textContent = wk+' learned in the last 14 days · '+learnedIds().length+' total';
  // objective UI
  renderObjUI();
  // achievements
  renderAchievements();
}
function renderObjUI(){
  document.querySelectorAll("#objChips .chip").forEach(ch=> ch.classList.toggle("on", ch.dataset.v===settings.objective));
  $("objSub").textContent=' — '+({everything:"Learn everything",general:"General foundations",specialise:"Specialise",debate:"Debate prep",sharp:"Stay sharp"}[settings.objective]||'');
  $("focusChips").innerHTML=KN.fields.map(f=>'<button class="chip'+((settings.focus||[]).includes(f.id)?' on':'')+'" data-f="'+f.id+'">'+esc(f.icon)+' '+esc(f.label)+'</button>').join('');
  document.querySelectorAll("#focusChips .chip").forEach(ch=> ch.onclick=()=>{ const f=ch.dataset.f; settings.focus=settings.focus||[];
    const i=settings.focus.indexOf(f); if(i>=0) settings.focus.splice(i,1); else { if(settings.focus.length>=3){ toast("Up to 3 focus fields"); return; } settings.focus.push(f); }
    persistAll(); renderObjUI(); setSub(); });
  document.querySelectorAll("#paceSeg .s").forEach(s=> s.classList.toggle("active", +s.dataset.pace===settings.pace));
  $("paceVal").textContent='· '+settings.pace+' a day';
}
function renderAchievements(){
  const have=new Set(unlockedIds());
  $("achGrid").innerHTML=ACHIEVEMENTS.map(a=>{ const on=have.has(a.id);
    return '<div class="ach'+(on?' on':'')+'"><div class="achi">'+(on?a.icon:'🔒')+'</div><div class="acht">'+esc(a.t)+'</div><div class="achd">'+esc(a.d)+'</div></div>'; }).join('');
  $("achCap").innerHTML='<b>'+have.size+'</b> of '+ACHIEVEMENTS.length+' unlocked';
}

// ================= canvas drawing =================
function drawRing(cv, frac, opt){ if(!cv) return; const ctx=cv.getContext("2d"); const w=cv.width, h=cv.height, cx=w/2, cy=h/2, r=w*0.4;
  ctx.clearRect(0,0,w,h); ctx.lineWidth=w*0.085; ctx.lineCap="round";
  const css=getComputedStyle(document.documentElement);
  ctx.strokeStyle=css.getPropertyValue('--track')||'#eee'; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  const grad=ctx.createLinearGradient(0,0,w,h); grad.addColorStop(0,"#ff7a18"); grad.addColorStop(1,"#ff2f3d");
  ctx.strokeStyle=grad; ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(frac,0,1)); ctx.stroke();
}
function drawFieldRadar(){ const cv=$("fieldRadar"); if(!cv) return; const ctx=cv.getContext("2d");
  const w=cv.width,h=cv.height,cx=w/2,cy=h/2, R=w*0.34; const fields=KN.fields; const n=fields.length; if(!n) return;
  ctx.clearRect(0,0,w,h);
  const css=getComputedStyle(document.documentElement);
  const line=css.getPropertyValue('--sep')||'rgba(0,0,0,.1)', l3=css.getPropertyValue('--l3')||'#999', accent=(css.getPropertyValue('--accent')||'#e8551c').trim();
  // grid rings
  ctx.strokeStyle=line; ctx.lineWidth=1;
  [0.33,0.66,1].forEach(g=>{ ctx.beginPath(); for(let i=0;i<n;i++){ const a=-Math.PI/2+i/n*Math.PI*2; const x=cx+Math.cos(a)*R*g, y=cy+Math.sin(a)*R*g; i?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.closePath(); ctx.stroke(); });
  // spokes + labels
  ctx.fillStyle=l3; ctx.font='600 '+(w*0.038)+'px -apple-system,sans-serif'; ctx.textAlign="center"; ctx.textBaseline="middle";
  for(let i=0;i<n;i++){ const a=-Math.PI/2+i/n*Math.PI*2; const x=cx+Math.cos(a)*R, y=cy+Math.sin(a)*R;
    ctx.strokeStyle=line; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.stroke();
    const lx=cx+Math.cos(a)*(R+w*0.06), ly=cy+Math.sin(a)*(R+w*0.06); ctx.fillText(fields[i].icon||'', lx, ly); }
  // data polygon
  const scores=fields.map(f=> byField[f.id].length? clamp(learnedInField(f.id)/byField[f.id].length,0,1):0);
  ctx.beginPath(); for(let i=0;i<n;i++){ const a=-Math.PI/2+i/n*Math.PI*2; const v=Math.max(scores[i],0.02); const x=cx+Math.cos(a)*R*v, y=cy+Math.sin(a)*R*v; i?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.closePath();
  ctx.fillStyle=hexA(accent,0.22); ctx.fill(); ctx.strokeStyle=accent; ctx.lineWidth=2; ctx.stroke();
  for(let i=0;i<n;i++){ const a=-Math.PI/2+i/n*Math.PI*2; const v=Math.max(scores[i],0.02); ctx.beginPath(); ctx.arc(cx+Math.cos(a)*R*v, cy+Math.sin(a)*R*v, 3, 0, Math.PI*2); ctx.fillStyle=accent; ctx.fill(); }
}
function openFields(){ renderFieldsSheet(); openSheet("Fields"); }
function renderFieldsSheet(){
  const rows=KN.fields.map(f=>{
    const total=byField[f.id].length, done=learnedInField(f.id), pct=total?Math.round(done/total*100):0;
    return { f, total, done, pct };
  }).sort((a,b)=> b.done-a.done || b.pct-a.pct);
  $("fieldsBody").innerHTML = rows.map(r=>
    '<button class="fieldrow" data-f="'+r.f.id+'" style="--fc:'+(r.f.color||'#888')+';">'+
      '<span class="frico">'+esc(r.f.icon||'')+'</span>'+
      '<span class="frmain"><span class="frtop"><span class="frlabel">'+esc(r.f.label)+'</span>'+
        '<span class="frcount">'+r.done+' / '+r.total+'</span></span>'+
        '<span class="frbar"><i style="width:'+Math.max(r.pct,2)+'%"></i></span></span>'+
    '</button>').join('');
  document.querySelectorAll("#fieldsBody .fieldrow").forEach(el=> el.onclick=()=>{
    feedFilter=el.dataset.f; feedStatus="all"; closeSheet("Fields"); showTab("feed"); });
}
function hexA(hex,a){ hex=hex.trim(); if(hex[0]!=='#'||hex.length<7) return 'rgba(232,85,28,'+a+')'; const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return 'rgba('+r+','+g+','+b+','+a+')'; }
function lastNDaysActivity(n){ const out=[]; for(let i=n-1;i>=0;i--){ const d=dayOffsetStr(-i); const a=(settings.activity||{})[d]||{l:0,r:0,q:0}; out.push({d, l:a.l||0, r:a.r||0, q:a.q||0}); } return out; }
function drawProgress(){ const cv=$("progChart"); if(!cv) return; const ctx=cv.getContext("2d"); const w=cv.width,h=cv.height;
  ctx.clearRect(0,0,w,h); const data=lastNDaysActivity(14); const max=Math.max(1,...data.map(d=>d.l+d.r+d.q));
  const css=getComputedStyle(document.documentElement); const accent=(css.getPropertyValue('--accent')||'#e8551c').trim(); const l3=css.getPropertyValue('--l3')||'#999';
  const pad=w*0.02, bw=(w-pad*2)/data.length, gap=bw*0.28;
  data.forEach((d,i)=>{ const v=d.l+d.r+d.q; const bh=(h-24)*(v/max); const x=pad+i*bw+gap/2, y=h-20-bh, bwi=bw-gap;
    const grad=ctx.createLinearGradient(0,y,0,h); grad.addColorStop(0,"#ff7a18"); grad.addColorStop(1,"#ff2f3d");
    ctx.fillStyle=v?grad:(css.getPropertyValue('--track')||'#eee'); roundRect(ctx,x,v?y:h-22,bwi,v?bh:2,Math.min(5,bwi/2)); ctx.fill(); });
  ctx.fillStyle=l3; ctx.font='600 '+(w*0.022)+'px -apple-system,sans-serif'; ctx.textAlign="center"; ctx.textBaseline="top";
  data.forEach((d,i)=>{ if(i%2===0){ const dd=new Date(); dd.setDate(dd.getDate()-(13-i)); ctx.fillText(dd.getDate(), pad+i*bw+bw/2, h-16); } });
}
function roundRect(ctx,x,y,w,h,r){ r=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

// ================= appearance =================
function applyTheme(){ const m=settings.theme||'auto';
  const dark = m==='dark' || (m!=='light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark',dark);
  document.documentElement.style.background = dark?'#000':'#f2f2f7';
  document.querySelectorAll("#themeSeg .s").forEach(s=> s.classList.toggle("active", s.dataset.theme===m));
}

// ================= persistence helpers =================
function persistAll(){ sset("settings",settings); sset("progress",progress); }
function refreshAll(){ renderFeed(); renderMe(); if($("sheetLibrary").classList.contains("show")) renderLibList(); }

// ================= onboarding =================
function renderOnboarding(step){
  step=step||1;
  const ob=$("obCard");
  if(step===1){
    ob.innerHTML=`<div class="obbrand"><span class="wordmark">Clue</span></div>
      <p class="obtag">A feed for your brain. Scroll real ideas across every field, tap to go as deep as you like — from the basics to where the experts still disagree. A few a day, remembered for good.</p>
      <div class="oblabel">First, your name</div>
      <input id="obName" type="text" autocapitalize="words" placeholder="Your first name">
      <button class="btn wide" id="obNext" style="margin-top:18px;">Continue</button>`;
    $("obName").value=settings.name||"";
    $("obNext").onclick=()=>{ settings.name=($("obName").value||"").trim().slice(0,24); renderOnboarding(2); };
  } else if(step===2){
    const opts=[{v:"everything",b:"Just show me everything",s:"No focus needed — explore it all, from the basics up"},
                {v:"specialise",b:"Specialise",s:"Go deep in the fields you choose"},
                {v:"debate",b:"Debate prep",s:"Arguments, evidence and rebuttals"},
                {v:"sharp",b:"Stay sharp",s:"Light daily review to keep it fresh"}];
    ob.innerHTML=`<div class="obtitle">How do you want to learn?</div>
      <p class="obp">This only nudges your daily mix — you can change it (or ignore it) anytime in Me. Not sure? Leave it on “everything”.</p>
      <div class="obopts">${opts.map(o=>'<button class="obopt'+(settings.objective===o.v?' on':'')+'" data-v="'+o.v+'"><b>'+o.b+'</b><span>'+o.s+'</span></button>').join('')}</div>
      <button class="btn wide" id="obNext" style="margin-top:18px;">Continue</button>`;
    document.querySelectorAll("#obCard .obopt").forEach(o=> o.onclick=()=>{ settings.objective=o.dataset.v; document.querySelectorAll("#obCard .obopt").forEach(x=>x.classList.toggle("on",x===o)); });
    $("obNext").onclick=()=> renderOnboarding(3);
  } else {
    ob.innerHTML=`<div class="obtitle">Pick a few favourites</div>
      <p class="obp">Fields you tap get weighted higher in your daily cards. Optional — skip to get a balanced mix.</p>
      <div class="chips wrap" id="obFocus">${KN.fields.map(f=>'<button class="chip'+((settings.focus||[]).includes(f.id)?' on':'')+'" data-f="'+f.id+'">'+esc(f.icon)+' '+esc(f.label)+'</button>').join('')}</div>
      <button class="btn wide" id="obDone" style="margin-top:18px;">Start learning</button>`;
    document.querySelectorAll("#obFocus .chip").forEach(ch=> ch.onclick=()=>{ const f=ch.dataset.f; settings.focus=settings.focus||[]; const i=settings.focus.indexOf(f); if(i>=0) settings.focus.splice(i,1); else { if(settings.focus.length>=3){ toast("Up to 3"); return; } settings.focus.push(f); } ch.classList.toggle("on"); });
    $("obDone").onclick=async()=>{ settings.onboarded=true; await persistAll(); $("onboardWrap").classList.remove("show"); refreshAll(); toast("Welcome to Clue 📖", true); };
  }
}

// ================= settings wiring =================
function wireSettings(){
  $("openSettings").onclick=()=>{ $("nameIn").value=settings.name||""; renderAccount(); renderAbout(); openSheet("Settings"); };
  $("settingsClose").onclick=()=>{ closeSheet("Settings"); renderMe(); };
  $("scrimSettings").onclick=()=>{ closeSheet("Settings"); renderMe(); };
  $("nameIn").onchange=()=>{ settings.name=($("nameIn").value||"").trim().slice(0,24); persistAll(); renderMe(); renderFeed(); };
  document.querySelectorAll("#themeSeg .s").forEach(s=> s.onclick=()=>{ settings.theme=s.dataset.theme; applyTheme(); persistAll(); refreshAll(); });
  // export / import / reset
  $("exportBtn").onclick=doExport;
  $("importBtn").onclick=()=> $("importFile").click();
  $("importFile").onchange=doImport;
  $("resetBtn").onclick=async()=>{ if(!confirm("Reset all progress, XP and streak? Your library stays. This cannot be undone.")) return;
    progress={}; settings=Object.assign(settings,{ xp:0,streak:0,bestStreak:0,lastSessionDay:"",sessionsDone:0,quizCorrectTotal:0,debatesBuilt:0,countersRead:0,achUnlocked:[],daily:{day:"",count:0},activity:{},fotd:null });
    await persistAll(); session=null; toast("Progress reset"); refreshAll(); renderLearn(); };
}
function renderAbout(){ $("aboutBody").innerHTML='<p style="font-size:14px;color:var(--l2);line-height:1.55;margin:14px 0;">'+
  '<b>Clue</b> is a knowledge & argument trainer. Discover a few cards a day, lock them in with spaced-repetition review and quizzes, and assemble the facts into a case in Debate mode.</p>'+
  '<p style="font-size:14px;color:var(--l2);line-height:1.55;">'+KN.cards.length+' cards across '+KN.fields.length+' fields in this build. Content is a curated seed — verify and expand it in <b>knowledge.json</b>.</p>'; }
async function doExport(){ const blob=new Blob([JSON.stringify({ _app:"clue", _v:1, when:new Date().toISOString(), settings, progress },null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="debate-backup-"+todayStr()+".json"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast("Backup downloaded"); }
function doImport(e){ const f=e.target.files&&e.target.files[0]; if(!f) return; const r=new FileReader();
  r.onload=async()=>{ try{ const d=JSON.parse(r.result); if(d.settings) settings=Object.assign(settings,d.settings); if(d.progress) progress=d.progress; await persistAll(); applyTheme(); toast("Backup restored"); refreshAll(); renderLearn(); }catch(err){ toast("Couldn’t read that file"); } };
  r.readAsText(f); e.target.value=""; }

// ================= pages / tab bar / swipe pager =================
function showTab(name){
  if(window.__revealBar) window.__revealBar();
  document.querySelectorAll(".page").forEach(p=> p.classList.toggle("active", p.dataset.tab===name));
  document.querySelectorAll(".tabitem").forEach(t=> t.classList.toggle("active", t.dataset.tab===name));
  if(window.__pageGo) window.__pageGo(name); else { try{ window.scrollTo(0,0); }catch(e){} }
  if(name==="feed") renderFeed();
  else if(name==="learn") renderLearn();
  else if(name==="debate") renderDebate();
  else if(name==="me") renderMe();
}
function wireNav(){
  document.querySelectorAll(".tabitem").forEach(t=> t.onclick=()=> showTab(t.dataset.tab));
  $("openLibrary").onclick=openLibrary;
  $("libClose").onclick=()=>closeSheet("Library"); $("scrimLibrary").onclick=()=>closeSheet("Library");
  const rw=document.querySelector("#pageMe .radarwrap"); if(rw){ rw.style.cursor="pointer"; rw.onclick=openFields; }
  $("fieldsClose").onclick=()=>closeSheet("Fields"); $("scrimFields").onclick=()=>closeSheet("Fields");
  $("libSearch").oninput=(e)=>{ libQuery=e.target.value; renderLibList(); };
  // immersive reader chrome
  $("rdClose").onclick=closeReader; $("rdSave").onclick=toggleSave; $("rdShare").onclick=shareCard;
  $("coachX").onclick=()=> $("coach").classList.remove("show");
  $("lnRestart").onclick=()=>{ if(session && session.phase!=='done'){ if(!confirm("End this session?")) return; } session=null; renderLearn(); };
  $("dbBack").onclick=()=>{ if(dbMotion){ dbMotion=null; renderDebate(); } };
  // objective chips
  document.querySelectorAll("#objChips .chip").forEach(ch=> ch.onclick=()=>{ settings.objective=ch.dataset.v; persistAll(); renderObjUI(); setSub(); checkAchievements(); });
  document.querySelectorAll("#paceSeg .s").forEach(s=> s.onclick=()=>{ settings.pace=+s.dataset.pace; persistAll(); renderObjUI(); setSub(); renderFeed(); });
}
// scroll-linked tab bar (reveal on scroll down, hide on scroll up; stays at bottom of content)
(function(){
  const bar=document.querySelector(".tabbar"); if(!bar) return; let offset=0, maxOff=120;
  const EASE="transform .3s cubic-bezier(.4,0,.2,1)";
  // px needed to tuck the bar fully off-screen. Re-measured whenever the height can change (safe-area inset
  // resolves after first paint, orientation, viewport chrome) so the bar always clears — and keep it clamped.
  function measure(){ const m=Math.round((bar.offsetHeight||100)*1.18); maxOff=m; if(offset>m){ offset=m; render(false); } }
  window.__barMeasure=measure;
  function render(snap){ bar.style.transition=snap?EASE:"none"; bar.style.transform=offset>0?"translateY("+offset+"px)":""; bar.style.pointerEvents=offset>=maxOff-1?"none":""; }
  window.__revealBar=function(){ offset=0; render(true); const a=document.querySelector(".page.active"); if(a) a._barLastY=a.scrollTop; };
  function onScroll(e){ const el=e.target; if(!el||!el.classList||!el.classList.contains("page")||!el.classList.contains("active")) return;
    const y=el.scrollTop, prev=(el._barLastY==null)?y:el._barLastY; el._barLastY=y;
    if(y+el.clientHeight>=el.scrollHeight-4){ if(offset!==0){ offset=0; render(true); } return; }
    const dy=y-prev; if(dy===0) return; offset=clamp(offset-dy,0,maxOff); render(false); }
  measure();
  window.addEventListener("resize",measure);
  window.addEventListener("load",measure);
  window.addEventListener("orientationchange",()=>setTimeout(measure,300));
  if(window.visualViewport) window.visualViewport.addEventListener("resize",measure);
  document.querySelectorAll(".page").forEach(p=> p.addEventListener("scroll",onScroll,{passive:true}));
})();
// finger-drag the four pages 1:1, snapping to nearest on release
(function(){
  const ORDER=["feed","learn","debate","me"];
  const pages=ORDER.map(n=>document.querySelector('.page[data-tab="'+n+'"]')); if(pages.some(p=>!p)) return;
  const shell=document.createElement("div"); shell.id="shell";
  const pager=document.createElement("div"); pager.id="pager";
  const track=document.createElement("div"); track.id="track"; pager.appendChild(track);
  pages[0].parentNode.insertBefore(shell,pages[0]); shell.appendChild(pager);
  pages.forEach(p=> track.appendChild(p));
  const tabbar=document.querySelector(".tabbar"); if(tabbar) shell.appendChild(tabbar);
  const N=ORDER.length, last=N-1;
  const W=()=> pager.clientWidth||window.innerWidth;
  const curTab=()=>{ const a=document.querySelector(".page.active"); return a?a.dataset.tab:"feed"; };
  const rubber=(over,dim)=> (1-1/(Math.abs(over)*0.55/dim+1))*dim*(over<0?-1:1);
  let idx=Math.max(0,ORDER.indexOf(curTab())), tx=0, raf=0;
  const apply=()=> track.style.transform="translateX("+tx+"px)";
  function place(i,animate,ms){ cancelAnimationFrame(raf); idx=clamp(i,0,last); track.style.transition=animate?("transform "+(ms||340)+"ms cubic-bezier(.32,.72,0,1)"):"none"; tx=-idx*W(); apply(); }
  window.__pageGo=(name)=>{ const i=ORDER.indexOf(name); if(i>=0&&i!==idx) place(i,true); };
  place(idx,false); window.addEventListener("resize",()=>place(idx,false));
  const blocked=el=>{ for(let n=el;n&&n!==document.body;n=n.parentElement){ if(n.matches&&n.matches('input,textarea,select,canvas,.seg,.chips,.tabbar,.sheet,.quizopts,.radarwrap,.progwrap')) return true;
    const ox=getComputedStyle(n).overflowX; if((ox==="auto"||ox==="scroll")&&n.scrollWidth>n.clientWidth+4) return true; } return false; };
  let x0=0,y0=0,armed=false,locked=false,dragging=false,lastX=0,lastT=0,vx=0;
  pager.addEventListener("touchstart",e=>{ if(e.touches.length!==1||document.querySelector(".sheet.show, #onboardWrap.show, .reader.show")||blocked(e.target)){ armed=false; return; }
    cancelAnimationFrame(raf); x0=lastX=e.touches[0].clientX; y0=e.touches[0].clientY; lastT=Date.now(); vx=0; armed=true; locked=false; dragging=false; track.style.transition="none"; },{passive:true});
  pager.addEventListener("touchmove",e=>{ if(!armed) return; const x=e.touches[0].clientX,y=e.touches[0].clientY,dx=x-x0,dy=y-y0;
    if(!locked){ const adx=Math.abs(dx),ady=Math.abs(dy); if(adx<6&&ady<6) return; if(adx<=ady*1.2){ armed=false; return; } locked=true; dragging=true; }
    e.preventDefault(); const tm=Date.now(),dt=tm-lastT; if(dt>0){ vx=0.8*((x-lastX)/dt)+0.2*vx; lastX=x; lastT=tm; }
    const W0=W(); let nx=-idx*W0+dx; if(nx>0) nx=rubber(nx,W0); else if(nx<-last*W0) nx=-last*W0+rubber(nx+last*W0,W0); tx=nx; apply(); },{passive:false});
  const end=e=>{ if(!armed) return; armed=false; if(!dragging) return; dragging=false;
    const W0=W(),dxe=(e.changedTouches?e.changedTouches[0].clientX-x0:0),proj=dxe+vx*150,flick=Math.abs(vx)>0.3; let target=idx;
    if((proj<=-W0*0.3||(flick&&vx<0))&&idx<last) target=idx+1; else if((proj>=W0*0.3||(flick&&vx>0))&&idx>0) target=idx-1;
    const remain=Math.abs(-target*W0-tx), ms=clamp(Math.round(remain/Math.max(Math.abs(vx),0.9)),200,420); place(target,true,ms);
    if(ORDER[target]!==curTab()) showTab(ORDER[target]); };
  pager.addEventListener("touchend",end,{passive:true}); pager.addEventListener("touchcancel",end,{passive:true});
})();
// hide tab bar while a field is focused (keyboard up)
(function(){ const isField=el=> el&&el.matches&&el.matches('input,textarea,select');
  const show=()=>{ if(!isField(document.activeElement)) document.body.classList.remove("kb"); };
  document.addEventListener("focusin",e=>{ if(isField(e.target)) document.body.classList.add("kb"); },true);
  document.addEventListener("focusout",()=> setTimeout(show,80),true);
  document.addEventListener("touchend",()=> setTimeout(show,0),{passive:true});
  if(window.visualViewport) window.visualViewport.addEventListener("resize",show);
})();
// portrait-only guard
function updateRotateGuard(){ const land=window.matchMedia&&matchMedia("(orientation: landscape)").matches; const small=Math.min(window.innerWidth,window.innerHeight)<540;
  $("rotateGuard").style.display=(land&&small)?"flex":"none"; }
window.addEventListener("resize",updateRotateGuard); window.addEventListener("orientationchange",updateRotateGuard);

// ================= boot =================
async function init(){
  settings=Object.assign(settings,(await sget("settings"))||{});
  progress=(await sget("progress"))||{};
  applyTheme();
  const ok=await loadKnowledge();
  if(!ok){ $("lnStage")&&($("lnStage").innerHTML='<div class="emptystate"><div class="ei">⚠️</div><h3>Couldn’t load the library</h3><p>knowledge.json failed to load. If you’re opening the file directly, serve the folder over http instead.</p></div>'); }
  resetDailyIfNeeded();
  if(settings.achUnlocked==null) settings.achUnlocked=unlockedIds();
  await persistAll();
  wireNav(); wireSettings();
  renderFeed(); renderMe(); updateRotateGuard();
  if(ok && !settings.onboarded){ renderOnboarding(1); $("onboardWrap").classList.add("show"); }
  hideSplash();
}
let splashGone=false;
function hideSplash(){ if(splashGone) return; splashGone=true; const s=$("splash"); if(s){ s.classList.add("gone"); setTimeout(()=>s.remove(),500); } if(window.__barMeasure) window.__barMeasure(); }
setTimeout(hideSplash, 4000);   // backstop so a thrown init never traps the splash
// register service worker
if("serviceWorker" in navigator){ window.addEventListener("load",()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); }); }
init();
