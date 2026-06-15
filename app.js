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
// error boundary: a thrown view must never blank or freeze the whole app
function safe(fn, label){ try{ return fn(); }catch(e){ console.error('[clue] '+(label||'render')+' failed:', e); return null; } }
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
  applyTheme(); refreshAll(); renderWeb();
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
  // let the browser/service-worker cache serve this instantly (the SW revalidates in the
  // background); forcing no-cache made the 700 KB file re-download on every open and could
  // fail on a flaky connection, leaving the app blank/"offline".
  try{ const r=await fetch("knowledge.json"); data=await r.json(); }
  catch(e){ try{ const r=await fetch("knowledge.json",{cache:"force-cache"}); data=await r.json(); }catch(e2){ data=null; } }
  if(!data){ return false; }
  KN.fields=data.fields||[]; KN.cards=data.cards||[]; KN.motions=data.motions||[]; KN.depths=data.depths||[];
  // evidence registry (optional, separate file — every source logged once, referenced by card.src[])
  try{ const r=await fetch("evidence.json"); const ev=await r.json(); EV=ev.sources||ev||{}; }
  catch(e){ EV={}; }
  // glossary registry (optional, separate file — jargon & canonical symbols)
  try{ const r=await fetch("glossary.json"); const gl=await r.json(); GL=gl.terms||gl||{}; }
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
  if(settings.objective==="sharp") s += (cardQuizzes(c).length?15:0);
  s += (hashStr(c.id+todayStr())%12);                            // gentle daily shuffle
  return s;
}
// a card is unlocked once everything it BUILDS ON is learned (missing/unknown prereq ids count as met)
function prereqsMet(c){ return (c.prereq||[]).every(id=> !byId[id] || isLearned(id)); }
function lockedBy(c){ return (c.prereq||[]).filter(id=> byId[id] && !isLearned(id)).map(id=>byId[id]); }
// round-robin the (already score-sorted) cards by field so a session mixes subjects
// (interleaving/mixed practice beats blocked practice for retention)
function interleaveByField(cards){
  const byF={}, order=[];
  cards.forEach(c=>{ if(!byF[c.field]){ byF[c.field]=[]; order.push(c.field); } byF[c.field].push(c); });
  const out=[];
  while(out.length<cards.length){ for(const f of order){ if(byF[f].length) out.push(byF[f].shift()); } }
  return out;
}
function buildDiscoverQueue(limit){
  // prerequisite-aware: only surface cards whose prereqs are already learned, so the
  // "builds on" chain unlocks in order. Foundational cards (no prereq) are always eligible.
  const cand = KN.cards.filter(c=> isNew(c.id) && prereqsMet(c));
  cand.sort((a,b)=> candidateScore(b)-candidateScore(a));
  // specialise = stay blocked on the focus field; every other objective interleaves
  const ordered = settings.objective==="specialise" ? cand : interleaveByField(cand);
  return ordered.slice(0,limit).map(c=>c.id);
}
function buildReviewQueue(){
  // most-overdue first sets the field order; round-robin then interleaves reviews across fields
  const due=dueCards().sort((a,b)=> progress[a].due-progress[b].due).map(id=>byId[id]);
  return interleaveByField(due).slice(0,40).map(c=>c.id);
}
function buildQuizQueue(){
  const pool = new Set([...(session?session.justLearned:[]), ...learnedIds()]);
  const arr=[...pool].filter(id=> byId[id] && cardQuizzes(byId[id]).length);
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
  {id:"focused", icon:"🎯", t:"Focused",      d:"Set a learning objective",      test:s=>s.objSet},
  {id:"half",    icon:"🧭", t:"Broadening",   d:"Start learning in half the fields", test:s=>s.fieldTotal>0 && s.fields>=Math.ceil(s.fieldTotal/2)},
  {id:"bookworm",icon:"📚", t:"Bookworm",     d:"Learn 5 book-depth insights",   test:s=>s.book>=5},
  {id:"quiz100", icon:"🧠", t:"Quiz Master",  d:"100 quiz answers correct",      test:s=>s.quiz>=100},
  {id:"level10", icon:"🏆", t:"Master",       d:"Reach level 10",                test:s=>s.level>=10},
  {id:"counter50",icon:"⚔️", t:"Devil's Advocate", d:"Read 50 counter-arguments", test:s=>s.counters>=50}
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
// 'date' card kind: a date to remember. `when` (free text like "14 Jul 1789") overrides `year`.
function cardDate(c){ return c.when || (c.year? String(c.year):''); }
// a card's quiz can be a single {q,choices,answer} or an array of them; pickQuiz rotates daily
function cardQuizzes(c){ const q=c&&c.quiz; return Array.isArray(q)?q.filter(Boolean):(q?[q]:[]); }
function pickQuiz(c){ const qs=cardQuizzes(c); return qs.length? qs[hashStr(c.id+todayStr())%qs.length] : null; }
function paras(s){ return esc(s).split(/\n\n+/).map(p=>'<p>'+p+'</p>').join(''); }

function setSub(){ const obj={everything:"Learn everything",general:"General foundations",specialise:"Specialise",debate:"Debate prep",sharp:"Stay sharp"}[settings.objective]||"";
  const due=dueCards().length, na=newAllowedToday();
  $("lnSub").textContent = obj + (due?(" · "+due+" due"):"") + (na?(" · "+na+" new"):""); }

function recentlyLearned(n){
  return learnedIds().filter(id=>byId[id])
    .sort((a,b)=> (progress[b].last||0)-(progress[a].last||0))
    .slice(0,n).map(id=>byId[id]);
}
// Learn home = the "Today" dashboard: streak ring + session CTA, day tiles,
// fact-of-the-day (the old "surprise" tile), and recently-learned. Reuses the
// streakrow / daytiles / fotd / learnlist components already in the stylesheet.
function renderTodayHome(stage){
  const due=dueCards().length, na=newAllowedToday(), streak=settings.streak||0;
  const learned=learnedIds().length, pace=settings.pace||5;
  const caughtUp = !due && !na;
  const infoLine = (due||na)
    ? [ due?('<b>'+due+'</b> to review'):'', na?('<b>'+na+'</b> new'):'' ].filter(Boolean).join(' · ')
    : (learned ? 'You’re all caught up' : 'Nothing queued — set your pace in Me');
  const btn = (due||na)
    ? '<button class="btn wide" id="lnStart">Start</button>'
    : (learned ? '<button class="btn tinted wide" id="lnExtra">Learn extra anyway</button>' : '');

  let html = '<div class="group"><div class="streakrow">'
    +   '<div class="streakring"><canvas id="lnRing" width="176" height="176"></canvas>'
    +     '<div class="srnum"><div class="srn">'+streak+'</div><div class="srk">day'+(streak===1?'':'s')+'</div></div></div>'
    +   '<div class="streakinfo"><div class="sit">'+(caughtUp&&learned?'All done today':'Today’s session')+'</div>'
    +     '<div class="sis">'+infoLine+'</div></div>'
    + '</div>'
    + (btn ? '<div class="pad" style="padding-top:0;">'+btn+'</div>' : '')
    + '</div>';

  html += '<div class="daytiles">'
    + '<div class="daytile"><div class="dtn'+(due?' hot':'')+'">'+due+'</div><div class="dtk">To review</div></div>'
    + '<div class="daytile"><div class="dtn">'+na+'</div><div class="dtk">New today</div></div>'
    + '<div class="daytile"><div class="dtn">'+learned+'</div><div class="dtk">Learned</div></div>'
    + '</div>';

  const fc=factOfDay();
  if(fc){ const fl=fieldById[fc.field]||{};
    html += '<div class="group fotd" id="lnFotd" data-id="'+fc.id+'" style="cursor:pointer;"><div class="pad">'
      + '<div class="fk">Fact of the day</div><div class="ft">'+esc(fc.title)+'</div>'
      + '<div class="fm">'+(fl.icon?esc(fl.icon)+' ':'')+esc(fl.label||'')+' · '+esc(teaser(fc))+'</div></div></div>';
  }

  const rec=recentlyLearned(5);
  if(rec.length){
    html += '<div class="mezone">Recently learned</div><div class="group"><div class="learnlist">'
      + rec.map(c=>{ const fl=fieldById[c.field]||{};
          return '<div class="lrow" data-id="'+c.id+'" style="cursor:pointer;">'
            + '<span class="ldot" style="background:'+(fl.color||'#888')+'"></span>'
            + '<span class="lnm">'+esc(c.title)+'</span>'
            + '<span class="lfield">'+esc(fl.label||'')+'</span></div>'; }).join('')
      + '</div></div>';
  }

  stage.innerHTML=html;
  drawRing($("lnRing"), pace ? clamp(((settings.daily&&settings.daily.count)||0)/pace,0,1) : 0);
  const sb=$("lnStart"); if(sb) sb.onclick=startSession;
  const ex=$("lnExtra"); if(ex) ex.onclick=()=>{ session={phase:'discover',review:[],reviewIdx:0,discover:buildDiscoverQueue(5),discoverIdx:0,quiz:[],quizIdx:0,revealed:false,justLearned:[],answered:null,stats:{learned:0,reviewed:0,quizCorrect:0,quizTotal:0,xp:0}}; if(!session.discover.length){ session.quiz=buildQuizQueue(); session.phase=session.quiz.length?'quiz':'done'; } renderLearn(); };
  const ft=$("lnFotd"); if(ft) ft.onclick=()=>{ feedReaderList=[]; openReader(ft.dataset.id); };
  document.querySelectorAll("#lnStage .lrow").forEach(r=> r.onclick=()=>{ feedReaderList=[]; openReader(r.dataset.id); });
}
function renderLearn(){
  setSub();
  const t=$("lnTitle"); if(t) t.textContent=greeting();
  const stage=$("lnStage"), bar=$("lnSessBar"), phaseEl=$("lnPhase"), restart=$("lnRestart");
  if(!session){
    bar.style.display="none"; phaseEl.style.display="none"; restart.style.display="none";
    renderTodayHome(stage);
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
      return '<div class="kmedia eq"><span class="katexeq" data-tex="'+esc(tex)+'" data-display="1">'+esc(plain)+'</span>'+(m.say?'<div class="kmsay"><span>reads as</span> '+esc(m.say)+'</div>':'')+(m.caption?'<div class="kmcap">'+esc(m.caption)+'</div>':'')+'</div>'; }
    if(m.type==='image'||m.type==='figure'||m.type==='map'){ if(!m.src) return '';
      return '<figure class="kmedia"><img src="'+esc(m.src)+'" alt="'+esc(m.alt||m.caption||'')+'" loading="lazy">'+(m.caption?'<figcaption>'+esc(m.caption)+'</figcaption>':'')+'</figure>'; }
    if(m.type==='plot'){ // dynamic SVG graph; spec rendered by renderViz()
      return '<figure class="kmedia kviz" data-viz="'+esc(JSON.stringify(m))+'">'+(m.caption?'<figcaption>'+esc(m.caption)+'</figcaption>':'')+'</figure>'; }
    return '';
  }).join('');
}
// cross-reference web: prereq (what this builds on) + xref (what it connects to)
function cardLinkChip(id, showState){ const t=byId[id]; if(!t) return ''; const fl=fieldById[t.field]||{};
  let mark='', cls='rdrel';
  if(showState){ const done=isLearned(id); cls+=done?' met':' unmet'; mark='<span class="rdrelmark">'+(done?'✓':'🔒')+'</span>'; }
  return '<button class="'+cls+'" data-id="'+esc(id)+'" style="--fc:'+(fl.color||'#888')+'">'+mark+(fl.icon?esc(fl.icon)+' ':'')+esc(t.title)+'</button>'; }
function relatedHtml(c){
  const pre=(c.prereq||[]).filter(id=>byId[id]);
  const xr=(c.xref||[]).filter(id=>byId[id]&&id!==c.id);
  let h='';
  if(pre.length) h+='<div class="rdrelblock"><div class="rdrelh">Builds on</div><div class="rdrelrow">'+pre.map(id=>cardLinkChip(id,true)).join('')+'</div></div>';
  if(xr.length) h+='<div class="rdrelblock"><div class="rdrelh">Connects to</div><div class="rdrelrow">'+xr.map(id=>cardLinkChip(id)).join('')+'</div></div>';
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
    // only auto-link distinctive symbols (math glyphs, multi-char); single Latin letters
    // like entropy's "S" are far too ambiguous and would match ordinary prose.
    if(g.symbol && !/^[A-Za-z]$/.test(g.symbol)) entries.push({id, text:g.symbol, sym:true}); }
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
      if(e.sym){ idx=text.indexOf(e.text);
        // a symbol must stand alone — not be wedged against letters or digits
        if(idx>=0){ const b=text[idx-1]||' ', a=text[idx+e.text.length]||' ';
          if(/[A-Za-z0-9]/.test(b) || /[A-Za-z0-9]/.test(a)) idx=-1; } }
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

// ================= dynamic graphs (SVG viz engine — no dependencies) =================
// Renders media {type:'plot', kind, ...} slots into themed SVG. Static kinds draw once;
// interactive kinds add slider controls (and, for 'descent', a Play button) that redraw.
// All colours come from CSS vars so it tracks light/dark. Falls back to caption-only on error.
const SVGNS="http://www.w3.org/2000/svg";
function svgEl(tag,attrs){ const e=document.createElementNS(SVGNS,tag); for(const k in (attrs||{})) e.setAttribute(k,attrs[k]); return e; }
const VZ_W=340, VZ_H=240, VZ_PAD={l:34,r:14,t:14,b:30};
function vzCss(name){ try{ return getComputedStyle(document.documentElement).getPropertyValue(name).trim()||name; }catch(_){ return name; } }
// named curves f(x, params)
const VIZ_FN={
  line:(x,p)=>(p.m==null?1:+p.m)*x+(p.b==null?0:+p.b),
  quadratic:(x,p)=>(p.a==null?1:+p.a)*x*x+(p.b==null?0:+p.b)*x+(p.c==null?0:+p.c),
  sigmoid:(x,p)=>1/(1+Math.exp(-(p.k==null?1:+p.k)*x)),
  gaussian:(x,p)=>{const mu=p.mu==null?0:+p.mu,s=Math.max(1e-6,p.sigma==null?1:+p.sigma);return Math.exp(-((x-mu)*(x-mu))/(2*s*s))/(s*Math.sqrt(2*Math.PI));},
  exp:(x,p)=>Math.exp((p.k==null?1:+p.k)*x),
  log:(x)=>Math.log(x),
  sine:(x)=>Math.sin(x),
  sinc:(x)=>Math.abs(x)<1e-9?1:Math.sin(x)/x,
  call:(x,p)=>Math.max(0,x-(p.k==null?0:+p.k)),   // long-call option payoff
  put:(x,p)=>Math.max(0,(p.k==null?0:+p.k)-x),    // long-put option payoff
};
// two-input surfaces, for the contour/heatmap kind
const VIZ_FN2D={
  bowl:(x,y)=>x*x+y*y,
  saddle:(x,y)=>x*x-y*y,
};
function renderViz(root){
  if(!root) return;
  root.querySelectorAll('.kviz[data-viz]').forEach(el=>{
    if(el.dataset.vizDone) return; el.dataset.vizDone='1';
    let spec; try{ spec=JSON.parse(el.dataset.viz); }catch(e){ return; }
    try{ buildViz(el, spec); }catch(e){ /* leave caption only */ }
  });
}
function buildViz(fig, spec){
  const svg=svgEl('svg',{viewBox:'0 0 '+VZ_W+' '+VZ_H,class:'kvizsvg',role:'img','aria-label':(spec.caption||('graph: '+(spec.kind||'plot')))});
  const plot=svgEl('g',{}); svg.appendChild(plot);
  // controls/state
  const state={}; (spec.controls||[]).forEach(c=>state[c.name]=(c.value==null?0:+c.value));
  // insert svg before the caption (figcaption is last child if present)
  const cap=fig.querySelector('figcaption');
  fig.insertBefore(svg, cap||null);
  const readout=document.createElement('div'); readout.className='kvizread';
  if(cap) fig.insertBefore(readout, cap); else fig.appendChild(readout);
  const draw=()=>{ while(plot.firstChild) plot.removeChild(plot.firstChild); drawViz(plot, spec, state, readout); };
  // controls UI
  if((spec.controls||[]).length || spec.kind==='descent'){
    const ctr=document.createElement('div'); ctr.className='kvizctrls';
    (spec.controls||[]).forEach(c=>{
      const row=document.createElement('label'); row.className='kvizctrl';
      const nm=document.createElement('span'); nm.className='kvizcn'; nm.textContent=c.label||c.name;
      const val=document.createElement('span'); val.className='kvizcv'; val.textContent=fmtNum(state[c.name]);
      const inp=document.createElement('input'); inp.type='range'; inp.min=c.min; inp.max=c.max; inp.step=(c.step==null?0.1:c.step); inp.value=state[c.name];
      inp.setAttribute('aria-label', c.label||c.name);
      inp.addEventListener('input',()=>{ state[c.name]=+inp.value; val.textContent=fmtNum(state[c.name]); draw(); });
      row.appendChild(nm); row.appendChild(inp); row.appendChild(val); ctr.appendChild(row);
    });
    if(spec.kind==='descent'){
      const btn=document.createElement('button'); btn.type='button'; btn.className='kvizbtn'; btn.textContent='▶ Step downhill';
      btn.addEventListener('click',()=>descentStep(spec,state,draw,btn)); ctr.appendChild(btn);
    }
    fig.insertBefore(ctr, cap||null);
  }
  draw();
}
function fmtNum(v){ const n=+v; if(!isFinite(n)) return '—'; return (Math.abs(n)>=100||Number.isInteger(n))?String(Math.round(n*100)/100):n.toFixed(2); }
// coordinate scales for a data box
function vzScales(xr,yr){
  const x0=VZ_PAD.l,x1=VZ_W-VZ_PAD.r,y0=VZ_PAD.t,y1=VZ_H-VZ_PAD.b;
  return { sx:v=>x0+(v-xr[0])/(xr[1]-xr[0])*(x1-x0), sy:v=>y1-(v-yr[0])/(yr[1]-yr[0])*(y1-y0), box:{x0,x1,y0,y1} };
}
function niceStep(r){ const span=Math.abs(r[1]-r[0])||1, raw=span/4, mag=Math.pow(10,Math.floor(Math.log10(raw))), n=raw/mag; return (n<1.5?1:n<3?2:n<7?5:10)*mag; }
function vzAxes(g,sc,xr,yr,opts){
  opts=opts||{};
  const line=vzCss('--line'), l3=vzCss('--l3');
  const bx=sc.box;
  // soft graph-paper gridlines (skipped where a plot draws its own grid)
  if(opts.grid!==false){
    const xs=niceStep(xr), ys=niceStep(yr);
    for(let x=Math.ceil(xr[0]/xs)*xs; x<=xr[1]+1e-9; x+=xs){ const px=sc.sx(x); g.appendChild(svgEl('line',{x1:px.toFixed(1),y1:bx.y0,x2:px.toFixed(1),y2:bx.y1,stroke:line,'stroke-width':1})); }
    for(let y=Math.ceil(yr[0]/ys)*ys; y<=yr[1]+1e-9; y+=ys){ const py=sc.sy(y); g.appendChild(svgEl('line',{x1:bx.x0,y1:py.toFixed(1),x2:bx.x1,y2:py.toFixed(1),stroke:line,'stroke-width':1})); }
  }
  // zero axes, a touch stronger than the grid
  if(yr[0]<0&&yr[1]>0){ const y=sc.sy(0); g.appendChild(svgEl('line',{x1:bx.x0,y1:y,x2:bx.x1,y2:y,stroke:l3,'stroke-width':1.2})); }
  if(xr[0]<0&&xr[1]>0){ const x=sc.sx(0); g.appendChild(svgEl('line',{x1:x,y1:bx.y0,x2:x,y2:bx.y1,stroke:l3,'stroke-width':1.2})); }
  // muted extent labels (kept minimal for a clean look)
  if(opts.labels!==false){
    const tick=(vx,vy,txt,dx,dy,anchor)=>{ const t=svgEl('text',{x:(sc.sx(vx)+(dx||0)).toFixed(1),y:(sc.sy(vy)+(dy||0)).toFixed(1),fill:l3,'font-size':8.5,'text-anchor':anchor||'middle','font-weight':500}); t.textContent=txt; g.appendChild(t); };
    tick(xr[0],yr[0],fmtNum(xr[0]),2,12,'start'); tick(xr[1],yr[0],fmtNum(xr[1]),-2,12,'end');
    tick(xr[0],yr[1],fmtNum(yr[1]),-4,3,'end'); tick(xr[0],yr[0],fmtNum(yr[0]),-4,3,'end');
  }
}
function vzPath(sc,fn,p,xr,n){ n=n||80; let d=''; for(let i=0;i<=n;i++){ const x=xr[0]+(xr[1]-xr[0])*i/n, y=fn(x,p); if(!isFinite(y)) continue; d+=(d?'L':'M')+sc.sx(x).toFixed(1)+' '+sc.sy(y).toFixed(1)+' '; } return d; }
function arrow(g,x1,y1,x2,y2,color,w){ g.appendChild(svgEl('line',{x1,y1,x2,y2,stroke:color,'stroke-width':w||2,'stroke-linecap':'round'}));
  const a=Math.atan2(y2-y1,x2-x1),h=7; [a+2.7,a-2.7].forEach(ang=>g.appendChild(svgEl('line',{x1:x2,y1:y2,x2:x2+h*Math.cos(ang),y2:y2+h*Math.sin(ang),stroke:color,'stroke-width':w||2,'stroke-linecap':'round'}))); }
function vzText(g,x,y,txt,color,size,anchor){ const t=svgEl('text',{x,y,fill:color,'font-size':size||10,'text-anchor':anchor||'start','font-weight':600}); t.textContent=txt; g.appendChild(t); }

function drawViz(g, spec, st, readout){
  const accent=vzCss('--accent'), ink=vzCss('--ink'), l2=vzCss('--l2');
  const kind=spec.kind;
  if(readout) readout.textContent='';
  // ---- function family (function / linline / sigmoid / gaussian) ----
  if(kind==='function'||kind==='linline'||kind==='sigmoid'||kind==='gaussian'){
    const fnName = kind==='linline'?'line':(kind==='gaussian'?'gaussian':(kind==='sigmoid'?'sigmoid':spec.fn||'line'));
    const fn=VIZ_FN[fnName]||VIZ_FN.line;
    const xr=spec.domain||[-6,6]; const p=Object.assign({},spec.params||{},st);
    // y-range: explicit or sampled
    let yr=spec.yrange; if(!yr){ let lo=Infinity,hi=-Infinity; for(let i=0;i<=60;i++){ const y=fn(xr[0]+(xr[1]-xr[0])*i/60,p); if(isFinite(y)){lo=Math.min(lo,y);hi=Math.max(hi,y);} } if(!isFinite(lo)){lo=-1;hi=1;} const pad=(hi-lo||1)*0.15; yr=[lo-pad,hi+pad]; }
    const sc=vzScales(xr,yr); vzAxes(g,sc,xr,yr);
    if(spec.shade){ // area under curve to y=0 (or yr[0])
      const base=Math.max(yr[0],0); let d='M'+sc.sx(xr[0])+' '+sc.sy(base)+' ';
      for(let i=0;i<=80;i++){ const x=xr[0]+(xr[1]-xr[0])*i/80,y=fn(x,p); if(isFinite(y)) d+='L'+sc.sx(x).toFixed(1)+' '+sc.sy(y).toFixed(1)+' '; }
      d+='L'+sc.sx(xr[1])+' '+sc.sy(base)+' Z'; g.appendChild(svgEl('path',{d,fill:accent,'fill-opacity':0.14,stroke:'none'})); }
    g.appendChild(svgEl('path',{d:vzPath(sc,fn,p,xr),fill:'none',stroke:accent,'stroke-width':2.4,'stroke-linejoin':'round'}));
    if(kind==='linline'&&readout) readout.textContent='y = '+fmtNum(p.m==null?1:p.m)+'·x '+((p.b==null?0:+p.b)>=0?'+ ':'− ')+fmtNum(Math.abs(p.b==null?0:p.b));
    if(kind==='gaussian'&&readout) readout.textContent='μ = '+fmtNum(p.mu||0)+',  σ = '+fmtNum(p.sigma==null?1:p.sigma);
    return;
  }
  // ---- tangent: curve + draggable point + tangent line (derivative) ----
  if(kind==='tangent'){
    const fn=VIZ_FN[spec.fn||'quadratic'], p=spec.params||{a:0.25,b:0,c:0};
    const xr=spec.domain||[-6,6]; let lo=Infinity,hi=-Infinity; for(let i=0;i<=60;i++){const y=fn(xr[0]+(xr[1]-xr[0])*i/60,p);lo=Math.min(lo,y);hi=Math.max(hi,y);} const pad=(hi-lo||1)*0.12; const yr=spec.yrange||[lo-pad,hi+pad];
    const sc=vzScales(xr,yr); vzAxes(g,sc,xr,yr);
    g.appendChild(svgEl('path',{d:vzPath(sc,fn,p,xr),fill:'none',stroke:l2,'stroke-width':2}));
    const x0=st.x==null?1:st.x, h=0.001, slope=(fn(x0+h,p)-fn(x0-h,p))/(2*h), y0=fn(x0,p);
    const tx0=xr[0],tx1=xr[1]; // tangent across view
    g.appendChild(svgEl('line',{x1:sc.sx(tx0),y1:sc.sy(y0+slope*(tx0-x0)),x2:sc.sx(tx1),y2:sc.sy(y0+slope*(tx1-x0)),stroke:accent,'stroke-width':2.2}));
    g.appendChild(svgEl('circle',{cx:sc.sx(x0),cy:sc.sy(y0),r:4.5,fill:accent}));
    if(readout) readout.textContent='slope at x='+fmtNum(x0)+'  →  dy/dx = '+fmtNum(slope);
    return;
  }
  // ---- points: scatter (+ optional least-squares fit) ----
  if(kind==='points'){
    const pts=spec.pts||[]; const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
    const xr=spec.domain||[Math.min(...xs)-1,Math.max(...xs)+1], yr=spec.yrange||[Math.min(...ys)-1,Math.max(...ys)+1];
    const sc=vzScales(xr,yr); vzAxes(g,sc,xr,yr);
    if(spec.fit&&pts.length>1){ const n=pts.length,sX=xs.reduce((a,b)=>a+b,0),sY=ys.reduce((a,b)=>a+b,0),sXY=pts.reduce((a,p)=>a+p[0]*p[1],0),sXX=xs.reduce((a,x)=>a+x*x,0);
      const m=(n*sXY-sX*sY)/(n*sXX-sX*sX), b=(sY-m*sX)/n;
      g.appendChild(svgEl('line',{x1:sc.sx(xr[0]),y1:sc.sy(m*xr[0]+b),x2:sc.sx(xr[1]),y2:sc.sy(m*xr[1]+b),stroke:accent,'stroke-width':2.2}));
      if(readout) readout.textContent='best fit: y = '+fmtNum(m)+'·x '+(b>=0?'+ ':'− ')+fmtNum(Math.abs(b)); }
    pts.forEach(pt=>g.appendChild(svgEl('circle',{cx:sc.sx(pt[0]),cy:sc.sy(pt[1]),r:3.5,fill:ink,'fill-opacity':0.75})));
    return;
  }
  // ---- bars: values or softmax(values) ----
  if(kind==='bars'){
    let vals=(spec.values||[]).slice(); const labels=spec.labels||vals.map((_,i)=>String(i+1));
    if(spec.softmax){ const mx=Math.max(...vals); const ex=vals.map(v=>Math.exp(v-mx)); const s=ex.reduce((a,b)=>a+b,0); vals=ex.map(v=>v/s); }
    const hi=Math.max(...vals,spec.softmax?1:0.0001); const x0=VZ_PAD.l,x1=VZ_W-VZ_PAD.r,y0=VZ_PAD.t,y1=VZ_H-VZ_PAD.b;
    g.appendChild(svgEl('line',{x1:x0,y1:y1,x2:x1,y2:y1,stroke:vzCss('--l3'),'stroke-width':1}));
    const n=vals.length, gap=8, bw=(x1-x0-gap*(n+1))/n;
    vals.forEach((v,i)=>{ const bx=x0+gap+i*(bw+gap), bh=(v/hi)*(y1-y0);
      g.appendChild(svgEl('rect',{x:bx,y:y1-bh,width:bw,height:bh,rx:3,fill:accent,'fill-opacity':0.85}));
      vzText(g,bx+bw/2,y1+11,labels[i],vzCss('--l2'),9,'middle');
      vzText(g,bx+bw/2,y1-bh-4,spec.softmax?v.toFixed(2):fmtNum(v),ink,9,'middle'); });
    return;
  }
  // ---- vectors: arrows from origin ----
  if(kind==='vectors'||kind==='vectoradd'||kind==='dotproduct'){
    const R=spec.range||5; const xr=[-R,R],yr=[-R,R]; const sc=vzScales(xr,yr); vzAxes(g,sc,xr,yr);
    const colors=[accent,vzCss('--l2'),'#37b24d','#ae3ec9'];
    if(kind==='vectors'){ (spec.vecs||[]).forEach((v,i)=>{ arrow(g,sc.sx(0),sc.sy(0),sc.sx(v[0]),sc.sy(v[1]),colors[i%colors.length],2.4); if(v[2])vzText(g,sc.sx(v[0])+4,sc.sy(v[1]),v[2],colors[i%colors.length],11);}); return; }
    if(kind==='vectoradd'){ const ax=st.ax==null?3:st.ax,ay=st.ay==null?1:st.ay,bx=st.bx==null?1:st.bx,by=st.by==null?2:st.by;
      arrow(g,sc.sx(0),sc.sy(0),sc.sx(ax),sc.sy(ay),accent,2.4); vzText(g,sc.sx(ax)+3,sc.sy(ay),'a',accent,11);
      arrow(g,sc.sx(ax),sc.sy(ay),sc.sx(ax+bx),sc.sy(ay+by),colors[1],2); vzText(g,sc.sx(ax+bx/2)+3,sc.sy(ay+by/2),'b',colors[1],10);
      arrow(g,sc.sx(0),sc.sy(0),sc.sx(ax+bx),sc.sy(ay+by),'#37b24d',2.4); vzText(g,sc.sx(ax+bx)+3,sc.sy(ay+by),'a+b','#37b24d',11);
      if(readout) readout.textContent='a+b = ('+fmtNum(ax+bx)+', '+fmtNum(ay+by)+')'; return; }
    if(kind==='dotproduct'){ const la=st.la==null?3:st.la, lb=st.lb==null?3:st.lb, th=(st.theta==null?45:st.theta)*Math.PI/180;
      const ax=la,ay=0,bx=lb*Math.cos(th),by=lb*Math.sin(th);
      arrow(g,sc.sx(0),sc.sy(0),sc.sx(ax),sc.sy(ay),accent,2.4); vzText(g,sc.sx(ax)+3,sc.sy(ay)+12,'a',accent,11);
      arrow(g,sc.sx(0),sc.sy(0),sc.sx(bx),sc.sy(by),colors[1],2.4); vzText(g,sc.sx(bx)+3,sc.sy(by),'b',colors[1],11);
      const proj=lb*Math.cos(th); g.appendChild(svgEl('line',{x1:sc.sx(proj),y1:sc.sy(0),x2:sc.sx(bx),y2:sc.sy(by),stroke:vzCss('--l3'),'stroke-width':1,'stroke-dasharray':'3 3'}));
      if(readout) readout.textContent='a·b = '+fmtNum(la*lb*Math.cos(th))+'   (|a||b|cosθ, θ='+fmtNum(st.theta==null?45:st.theta)+'°)'; return; }
  }
  // ---- lintransform: unit grid + square under a 2x2 matrix ----
  if(kind==='lintransform'){
    const R=spec.range||4; const xr=[-R,R],yr=[-R,R]; const sc=vzScales(xr,yr);
    const a=st.a==null?1:st.a,b=st.b==null?0:st.b,c=st.c==null?0:st.c,d=st.d==null?1:st.d;
    const line=vzCss('--line'); // faint original grid
    for(let i=-R;i<=R;i++){ g.appendChild(svgEl('line',{x1:sc.sx(i),y1:sc.sy(-R),x2:sc.sx(i),y2:sc.sy(R),stroke:line,'stroke-width':1})); g.appendChild(svgEl('line',{x1:sc.sx(-R),y1:sc.sy(i),x2:sc.sx(R),y2:sc.sy(i),stroke:line,'stroke-width':1})); }
    vzAxes(g,sc,xr,yr,{grid:false,labels:false});
    const T=(x,y)=>[a*x+b*y,c*x+d*y]; // transformed grid (a few lines)
    const tcol=vzCss('--l3');
    for(let i=-R;i<=R;i++){ const p1=T(i,-R),p2=T(i,R),p3=T(-R,i),p4=T(R,i);
      g.appendChild(svgEl('line',{x1:sc.sx(p1[0]),y1:sc.sy(p1[1]),x2:sc.sx(p2[0]),y2:sc.sy(p2[1]),stroke:tcol,'stroke-width':i===0?1.5:0.7,'stroke-opacity':0.6}));
      g.appendChild(svgEl('line',{x1:sc.sx(p3[0]),y1:sc.sy(p3[1]),x2:sc.sx(p4[0]),y2:sc.sy(p4[1]),stroke:tcol,'stroke-width':i===0?1.5:0.7,'stroke-opacity':0.6})); }
    // transformed unit square (area = |det|)
    const sq=[[0,0],[1,0],[1,1],[0,1]].map(P=>T(P[0],P[1]));
    g.appendChild(svgEl('polygon',{points:sq.map(P=>sc.sx(P[0])+','+sc.sy(P[1])).join(' '),fill:accent,'fill-opacity':0.18,stroke:accent,'stroke-width':1.5}));
    const e1=T(1,0),e2=T(0,1); arrow(g,sc.sx(0),sc.sy(0),sc.sx(e1[0]),sc.sy(e1[1]),accent,2.4); arrow(g,sc.sx(0),sc.sy(0),sc.sx(e2[0]),sc.sy(e2[1]),'#37b24d',2.4);
    if(readout) readout.textContent='det = ad − bc = '+fmtNum(a*d-b*c)+'   (area of the shaded square)';
    return;
  }
  // ---- descent: convex curve with a ball that steps downhill ----
  if(kind==='descent'){
    const fn=VIZ_FN.quadratic, p=spec.params||{a:0.5,b:0,c:0}; const xr=spec.domain||[-5,5];
    let lo=Infinity,hi=-Infinity; for(let i=0;i<=60;i++){const y=fn(xr[0]+(xr[1]-xr[0])*i/60,p);lo=Math.min(lo,y);hi=Math.max(hi,y);} const yr=spec.yrange||[lo-0.5,hi*1.05];
    const sc=vzScales(xr,yr); vzAxes(g,sc,xr,yr);
    g.appendChild(svgEl('path',{d:vzPath(sc,fn,p,xr),fill:'none',stroke:l2,'stroke-width':2}));
    if(st._x==null) st._x=(spec.start==null?-4:spec.start);
    const x=st._x, y=fn(x,p); g.appendChild(svgEl('circle',{cx:sc.sx(x),cy:sc.sy(y),r:5.5,fill:accent}));
    const slope=2*p.a*x+(p.b||0);
    if(readout) readout.textContent='x = '+fmtNum(x)+',  loss = '+fmtNum(y)+',  slope = '+fmtNum(slope)+',  η = '+fmtNum(st.eta==null?0.1:st.eta);
    return;
  }
  // ---- contour: a 2-D surface f(x,y) as a heatmap, with the gradient arrow ----
  if(kind==='contour'){
    const R=spec.range||3; const xr=[-R,R],yr=[-R,R]; const sc=vzScales(xr,yr);
    const f2=VIZ_FN2D[spec.fn||'bowl']; const N=spec.cells||16;
    const bx=sc.box, cw=(bx.x1-bx.x0)/N, ch=(bx.y1-bx.y0)/N;
    let mx=1e-9; const vals=[];
    for(let i=0;i<N;i++){ vals[i]=[]; for(let j=0;j<N;j++){
      const xv=xr[0]+(i+0.5)/N*(xr[1]-xr[0]), yv=yr[1]-(j+0.5)/N*(yr[1]-yr[0]);
      const v=f2(xv,yv); vals[i][j]=v; if(v>mx)mx=v; } }
    for(let i=0;i<N;i++)for(let j=0;j<N;j++){ const op=Math.max(0,Math.min(0.85,vals[i][j]/mx));
      g.appendChild(svgEl('rect',{x:(bx.x0+i*cw).toFixed(1),y:(bx.y0+j*ch).toFixed(1),width:(cw+0.5).toFixed(1),height:(ch+0.5).toFixed(1),fill:accent,'fill-opacity':op.toFixed(3),stroke:'none'})); }
    vzAxes(g,sc,xr,yr,{grid:false,labels:false});
    if(spec.arrow!==false){ const px=spec.point?spec.point[0]:1.4, py=spec.point?spec.point[1]:1.1, h=0.01;
      const gx=(f2(px+h,py)-f2(px-h,py))/(2*h), gy=(f2(px,py+h)-f2(px,py-h))/(2*h);
      const len=Math.hypot(gx,gy)||1, L=R*0.32;
      g.appendChild(svgEl('circle',{cx:sc.sx(px),cy:sc.sy(py),r:3.5,fill:ink}));
      arrow(g,sc.sx(px),sc.sy(py),sc.sx(px+gx/len*L),sc.sy(py+gy/len*L),ink,2.4);
      vzText(g,sc.sx(px+gx/len*L)+3,sc.sy(py+gy/len*L),'∇f',ink,11); }
    if(readout) readout.textContent='darker = higher ground; ∇f points straight uphill';
    return;
  }
  // ---- lines: several straight lines, marking where the first two cross (a linear system) ----
  if(kind==='lines'){
    const R=spec.range||6, xr=[-R,R], lines=spec.lines||[]; let lo=Infinity,hi=-Infinity;
    lines.forEach(L=>[xr[0],xr[1]].forEach(x=>{ const y=L[0]*x+L[1]; lo=Math.min(lo,y); hi=Math.max(hi,y); }));
    if(!isFinite(lo)){lo=-R;hi=R;} const pad=(hi-lo||1)*0.12; const yr=spec.yrange||[lo-pad,hi+pad];
    const sc=vzScales(xr,yr); vzAxes(g,sc,xr,yr);
    const cols=[accent,'#37b24d','#1c7ed6'];
    lines.forEach((L,i)=>g.appendChild(svgEl('line',{x1:sc.sx(xr[0]),y1:sc.sy(L[0]*xr[0]+L[1]),x2:sc.sx(xr[1]),y2:sc.sy(L[0]*xr[1]+L[1]),stroke:cols[i%cols.length],'stroke-width':2.2})));
    if(lines.length>=2){ const[m1,b1]=lines[0],[m2,b2]=lines[1]; if(Math.abs(m1-m2)>1e-9){ const ix=(b2-b1)/(m1-m2), iy=m1*ix+b1;
      g.appendChild(svgEl('circle',{cx:sc.sx(ix),cy:sc.sy(iy),r:4.5,fill:ink}));
      if(readout) readout.textContent='solution: x = '+fmtNum(ix)+',  y = '+fmtNum(iy); } }
    return;
  }
  // ---- curves: several named functions overlaid, with a legend ----
  if(kind==='curves'){
    const curves=spec.curves||[], xr=spec.domain||[-6,6];
    let lo=Infinity,hi=-Infinity;
    curves.forEach(cv=>{ const fn=VIZ_FN[cv.fn||'line']; for(let i=0;i<=60;i++){ const y=fn(xr[0]+(xr[1]-xr[0])*i/60,cv.params||{}); if(isFinite(y)){lo=Math.min(lo,y);hi=Math.max(hi,y);} } });
    if(!isFinite(lo)){lo=-1;hi=1;} const pad=(hi-lo||1)*0.12; const yr=spec.yrange||[lo<0?lo-pad:0, hi+pad];
    const sc=vzScales(xr,yr); vzAxes(g,sc,xr,yr);
    const cols=[accent,'#1c7ed6','#37b24d','#ae3ec9'];
    curves.forEach((cv,i)=> g.appendChild(svgEl('path',{d:vzPath(sc,VIZ_FN[cv.fn||'line'],cv.params||{},xr),fill:'none',stroke:cols[i%cols.length],'stroke-width':2.4,'stroke-linejoin':'round'})));
    curves.forEach((cv,i)=>{ if(!cv.label) return; const ly=sc.box.y0+11+i*14, lx=sc.box.x0+8;
      g.appendChild(svgEl('line',{x1:lx,y1:ly,x2:lx+14,y2:ly,stroke:cols[i%cols.length],'stroke-width':3,'stroke-linecap':'round'}));
      vzText(g,lx+19,ly+3.5,cv.label,ink,9.5); });
    return;
  }
  // ---- network: a neuron / layered neural net as nodes-and-edges ----
  if(kind==='network'){
    const layers=spec.layers||[3,4,2], nL=layers.length;
    const x0=VZ_PAD.l, x1=VZ_W-VZ_PAD.r, y0=VZ_PAD.t+8, y1=VZ_H-VZ_PAD.b-(spec.labels?12:0);
    const colX=i=> nL===1? (x0+x1)/2 : x0+i/(nL-1)*(x1-x0);
    const pos=layers.map((n,i)=>{ const x=colX(i); const col=[];
      for(let j=0;j<n;j++){ const y= n===1? (y0+y1)/2 : y0+j/(n-1)*(y1-y0); col.push([x,y]); } return col; });
    const card=vzCss('--card');
    for(let i=0;i<nL-1;i++) for(const a of pos[i]) for(const b of pos[i+1])
      g.appendChild(svgEl('line',{x1:a[0].toFixed(1),y1:a[1].toFixed(1),x2:b[0].toFixed(1),y2:b[1].toFixed(1),stroke:vzCss('--line'),'stroke-width':1}));
    pos.forEach((col,i)=> col.forEach(p=> g.appendChild(svgEl('circle',{cx:p[0].toFixed(1),cy:p[1].toFixed(1),r:8,fill:(i===nL-1?accent:card),stroke:accent,'stroke-width':2})) ));
    if(spec.labels) spec.labels.forEach((lab,i)=> vzText(g,colX(i),y1+13,lab,l2,9,'middle'));
    return;
  }
}
function descentStep(spec,st,draw,btn){
  const p=spec.params||{a:0.5,b:0,c:0}; const eta=st.eta==null?0.1:st.eta;
  if(st._x==null) st._x=(spec.start==null?-4:spec.start);
  const reduce=(typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if(reduce){ for(let k=0;k<12;k++){ st._x-=eta*(2*p.a*st._x+(p.b||0)); } draw(); return; }
  let i=0; const tick=()=>{ const slope=2*p.a*st._x+(p.b||0); st._x=st._x-eta*slope; draw(); i++;
    if(i<12 && Math.abs(eta*slope)>0.002) requestAnimationFrame(()=>setTimeout(tick,90)); };
  tick();
}

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
  const id=session.quiz[session.quizIdx], c=byId[id], qz=pickQuiz(c);
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
  const id=session.quiz[session.quizIdx], c=byId[id]; const correct = i===pickQuiz(c).answer;
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
  $("lnAgain").onclick=()=>{ session=null; renderLearn(); showTab('learn'); };
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

// how "heavy" a card is to digest, 0 (quick fun fact) .. 1 (dense concept/book).
// Drives the slot-machine weave: level + depth-kind + layer count, with the dedicated
// "fun" field always treated as a light hit.
function cardHeft(c){
  let h = (((c.level||1)-1)/5);
  h += ({fact:0, event:0.05, concept:0.30, book:0.45})[c.depth] || 0;
  const L=(layersOf(c)||[]).length; if(L>=4) h+=0.15; else if(L>=3) h+=0.08;
  if(c.field==='fun') h*=0.25;
  return clamp(h,0,1);
}
function feedCandidates(){
  let list;
  if(feedFilter==="__saved"){ const s=new Set(settings.saved||[]); list=KN.cards.filter(c=>s.has(c.id)); }
  else { list=KN.cards.slice(); if(feedFilter!=="all") list=list.filter(c=>c.field===feedFilter); }
  if(feedStatus==="learned") list=list.filter(c=>isLearned(c.id));
  else if(feedStatus==="unlearned") list=list.filter(c=>!isLearned(c.id));
  if(list.length<3) return list;
  // within-bucket order: unseen first, focus fields a little earlier, then a stable daily shuffle
  const focus=new Set(settings.focus||[]);
  const skey=c=> (isNew(c.id)?0:1000) + (focus.has(c.field)?-60:0) + (hashStr(c.id+todayStr())%40);
  const sortInterleave=arr=> interleaveByField(arr.sort((a,b)=>skey(a)-skey(b)));
  // split into light hits vs heavier payoffs
  const light=[], heavy=[];
  list.forEach(c=> (cardHeft(c) < 0.42 ? light : heavy).push(c));
  const L=sortInterleave(light), H=sortInterleave(heavy);
  // slot-machine weave: mostly light, a heavier payoff dropped in every 2–4 cards (variable ratio)
  let out=[]; let li=0, hi=0, sinceHeavy=0;
  while(li<L.length || hi<H.length){
    const gap = 2 + (hashStr('g'+out.length+todayStr())%3);   // 2..4 light between payoffs
    if(hi<H.length && (sinceHeavy>=gap || li>=L.length)){ out.push(H[hi++]); sinceHeavy=0; }
    else if(li<L.length){ out.push(L[li++]); sinceHeavy++; }
    else if(hi<H.length){ out.push(H[hi++]); sinceHeavy=0; }
  }
  // open on a grabby light hit — prefer an unseen fun fact for the hook
  let op=out.findIndex(c=> c.field==='fun' && isNew(c.id));
  if(op<0) op=out.findIndex(c=> cardHeft(c)<0.3);
  if(op>0){ const [hook]=out.splice(op,1); out.unshift(hook); }
  // locked (not-yet-unlocked) cards stay visible but sink below what you can learn now
  const lk=c=> isNew(c.id) && !prereqsMet(c);
  out = out.filter(c=>!lk(c)).concat(out.filter(lk));
  return out;
}
function renderFeed(){
  $("feedSub").textContent = greeting()+" — what do you want to understand today?";
  renderFeedFilter(); renderFeedStatus(); renderFeedList();
}
function renderFeedStatus(){
  document.querySelectorAll("#feedStatus .s").forEach(s=>{
    s.classList.toggle("active", s.dataset.s===feedStatus);
    s.onclick=()=>{ feedStatus=s.dataset.s; renderFeedStatus(); renderFeedList(); };
  });
}
function renderFeedFilter(){
  const saved=(settings.saved||[]).length;
  const chips=[{id:"all",label:"For you",icon:"✨"}]
    .concat(saved?[{id:"__saved",label:"Saved",icon:"🔖"}]:[])
    .concat(KN.fields.map(f=>({id:f.id,label:f.label,icon:f.icon})));
  $("feedFilter").innerHTML=chips.map(f=>'<button class="chip'+(feedFilter===f.id?' on':'')+'" data-f="'+f.id+'">'+(f.icon?esc(f.icon)+' ':'')+esc(f.label)+'</button>').join('');
  document.querySelectorAll("#feedFilter .chip").forEach(ch=> ch.onclick=()=>{ feedFilter=ch.dataset.f; renderFeedFilter(); renderFeedList(); });
}
function feedCardHtml(c, featured){
  const fl=fieldById[c.field]||{}, col=fl.color||'#888';
  const depthN=layersOf(c).length, st=cardState(c.id);
  const saved=(settings.saved||[]).includes(c.id);
  const isTheory = c.depth==='concept'||c.depth==='book';
  const locks = isNew(c.id) ? lockedBy(c) : [];
  return '<button class="fcard'+(featured?' feat':'')+(locks.length?' islocked':'')+'" data-id="'+c.id+'" style="--fc:'+col+';">'+
    '<div class="fctop"><span class="fcfield">'+(fl.icon?esc(fl.icon)+' ':'')+esc(fl.label||'')+'</span>'+
      (isTheory?'<span class="fctag">theory</span>':'')+
      (saved?'<span class="fcsaved">🔖</span>':'')+'</div>'+
    (c.kind==='date'?'<div class="fcdate">📅 '+esc(cardDate(c))+'</div>':'')+
    '<div class="fctitle">'+esc(c.title)+'</div>'+
    '<div class="fchook">'+esc(teaser(c))+'</div>'+
    (locks.length?('<div class="fclock">'+ICON.lock+'Not yet unlocked · builds on '+esc(locks.map(p=>p.title).join(', '))+'</div>'):'')+
    '<div class="fcfoot"><span class="fcdepth">▽ '+depthN+' level'+(depthN===1?'':'s')+'</span>'+
      '<span class="fcstate '+st.cls+'">'+st.txt+'</span></div>'+
    '</button>';
}
function renderFeedList(){
  const list=feedCandidates();
  feedOrder=list.map(c=>c.id);
  if(!list.length){
    const hasLocked = feedStatus!=="learned" && feedFilter!=="__saved" &&
      KN.cards.some(c=> (feedFilter==="all"||c.field===feedFilter) && isNew(c.id) && !prereqsMet(c));
    $("feedList").innerHTML='<div class="emptystate"><div class="ei">'+(hasLocked?'🔒':'🔍')+'</div><p>'+
      (hasLocked?'Learn the foundations first — these cards unlock as you go.':'Nothing here yet.')+'</p></div>'; return; }
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
function cardState(id){ const c=byId[id];
  if(isNew(id)) return (c && !prereqsMet(c)) ? {cls:"locked",txt:"Locked"} : {cls:"new",txt:"New"};
  if(isDue(id)) return {cls:"due",txt:"Due"}; return {cls:"learned",txt:"Learned"}; }
function renderLibList(){
  const q=libQuery.trim().toLowerCase();
  let list=KN.cards.filter(c=> libFieldFilter==="all" || c.field===libFieldFilter);
  if(q){ list=list.filter(c=> (c.title+' '+c.fact+' '+(c.detail||'')+' '+cardSourceText(c)+' '+(c.tags||[]).join(' ')).toLowerCase().includes(q)); }
  if(!list.length){ $("libList").innerHTML='<div class="emptystate"><div class="ei">🔍</div><p>No cards match.</p></div>'; return; }
  $("libList").innerHTML=list.map(c=>{ const fl=fieldById[c.field]||{}, st=cardState(c.id);
    const lk = st.cls==='locked' ? lockedBy(c) : [];
    const meta = lk.length ? ('🔒 builds on '+esc(lk.map(p=>p.title).join(', '))) : (esc(fl.label||'')+' · '+esc(depthLabel(c.depth)));
    return '<div class="libcard'+(lk.length?' islocked':'')+'" data-id="'+c.id+'"><span class="lcdot" style="background:'+(fl.color||'#888')+'"></span>'+
      '<div class="lcinfo"><div class="lctitle">'+esc(c.title)+'</div><div class="lcmeta">'+meta+'</div></div>'+
      '<span class="lcstate '+st.cls+'">'+st.txt+'</span></div>'; }).join('');
  document.querySelectorAll("#libList .libcard").forEach(r=> r.onclick=()=>openCard(r.dataset.id));
}

// ================= IMMERSIVE READER (peel-to-deepen) =================
let rdId=null, rdRevealed=1, feedReaderList=[], rdSwipeInit=false, rdSwiping=false, rdTouch=null;

function openReader(id){
  const c=byId[id]; if(!c) return;
  rdId=id; rdRevealed=1;
  if(!feedReaderList.length) feedReaderList = feedOrder.length? feedOrder.slice() : KN.cards.map(x=>x.id);
  if(feedReaderList.indexOf(id)<0) feedReaderList.unshift(id);
  if(!rdSwipeInit){ initReaderSwipe(); rdSwipeInit=true; }
  renderReader();
  const r=$("reader"); r.classList.add("show"); r.setAttribute("aria-hidden","false");
  document.body.classList.add("reading"); $("rdBody").scrollTop=0;
}
function closeReader(){ const r=$("reader"); r.classList.remove("show"); r.setAttribute("aria-hidden","true");
  document.body.classList.remove("reading"); rdId=null; refreshAll(); }
function readerNext(){ const i=feedReaderList.indexOf(rdId); let n=(i>=0?i+1:0); if(n>=feedReaderList.length) n=0; openReader(feedReaderList[n]); }
function readerPrev(){ const i=feedReaderList.indexOf(rdId); let n=(i>=0?i-1:0); if(n<0) n=feedReaderList.length-1; openReader(feedReaderList[n]); }
// swipe the reader left/right to move to the next/previous card (ignores sliders, equations, buttons)
function initReaderSwipe(){
  const r=$("reader"); if(!r) return;
  r.addEventListener("touchstart",e=>{
    if(e.touches.length!==1 || (e.target.closest && e.target.closest(".kviz,input,button,a,textarea"))){ rdTouch=null; return; }
    const t=e.touches[0]; rdTouch={x:t.clientX,y:t.clientY}; rdSwiping=false;
  },{passive:true});
  r.addEventListener("touchmove",e=>{
    if(!rdTouch || e.touches.length!==1) return;
    const t=e.touches[0], dx=t.clientX-rdTouch.x, dy=t.clientY-rdTouch.y;
    if(Math.abs(dx)>28 && Math.abs(dx)>Math.abs(dy)*1.4) rdSwiping=true;
  },{passive:true});
  r.addEventListener("touchend",e=>{
    if(!rdTouch){ return; }
    const t=e.changedTouches[0], dx=t.clientX-rdTouch.x, dy=t.clientY-rdTouch.y; rdTouch=null;
    if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.4){ (dx<0?readerNext:readerPrev)(); setTimeout(()=>{rdSwiping=false;},80); }
    else rdSwiping=false;
  },{passive:true});
}

function renderReader(){
  const c=byId[rdId]; if(!c) return;
  const fl=fieldById[c.field]||{}, col=fl.color||'#888';
  const layers=layersOf(c), total=layers.length;
  rdRevealed=clamp(rdRevealed,1,total);
  $("rdHead").style.setProperty('--fc',col);
  $("rdProg").innerHTML=layers.map((l,i)=>'<span class="rddot'+(i<rdRevealed?' on':'')+'"></span>').join('');
  $("rdSave").classList.toggle("on",(settings.saved||[]).includes(rdId));

  let body='<div class="rdField" style="--fc:'+col+'">'+(fl.icon?esc(fl.icon)+' ':'')+esc(fl.label||'')+(c.kind!=='date'&&c.year?(' · '+c.year):'')+'</div>';
  if(c.kind==='date') body+='<div class="rddate" style="--fc:'+col+'">'+esc(cardDate(c))+'</div>';
  body+='<h1 class="rdTitle">'+esc(c.title)+'</h1>';
  if(isNew(rdId) && !prereqsMet(c)){ const lk=lockedBy(c);
    body+='<div class="rdlocked">'+ICON.lock+'<div class="rdlockedtxt"><div class="rdlockedrow">'+lk.map(p=>cardLinkChip(p.id,true)).join('')+'</div><div class="rdlockednote">Builds on the above — best learned first, but read on if you like.</div></div></div>'; }
  for(let i=0;i<rdRevealed;i++){ const l=layers[i];
    body+='<div class="rdLayer d-'+esc(l.d||'')+'"><div class="rdLabel">'+esc(l.t||'')+'</div>'+paras(l.body||'')+'</div>'; }
  // figures & equations are core to the concept — show them straight away, not behind the final peel
  const mh=mediaHtml(c); if(mh) body+='<div class="rdMedia">'+mh+'</div>';
  // once every layer is open, the source / "use it & contest it" box / quiz / actions live in the scroll
  if(rdRevealed>=total){
    body+='<div class="rdEnd">'+sourceLine(c)+debateBox(c)+relatedHtml(c)+'</div>';
    if(cardQuizzes(c).length) body+='<button class="btn tinted wide sm" id="rdQuiz" style="margin-top:12px;">Quick check ⚡</button>';
    if(isNew(rdId)) body+='<button class="btn wide" id="rdLearn" style="margin-top:10px;">＋ Add to my learning</button>';
    else body+='<div class="rddone">'+(isLearned(rdId)?('✓ In your deck · next review '+relDue(progress[rdId].due)):'In progress')+'</div>';
    body+='<div class="rdnav"><button class="btn plain sm" id="rdPrev">‹ Prev</button><button class="btn plain sm" id="rdNext">Next ›</button></div>';
  }
  $("rdBody").innerHTML=body;
  // tap anywhere on the card to peel the next layer (links / buttons excepted)
  $("rdBody").onclick = (rdRevealed<total) ? (e=>{ if(rdSwiping||e.target.closest('a')||e.target.closest('button')||e.target.closest('.kviz')) return; rdRevealed++; renderReader(); }) : null;
  renderMath($("rdBody"));
  renderViz($("rdBody"));
  decorateGlossary($("rdBody"));
  // related-card chips (prereq / xref) navigate the reader to that card
  document.querySelectorAll("#rdBody .rdrel").forEach(b=> b.onclick=(e)=>{ e.stopPropagation(); openReader(b.dataset.id); });
  // foot: a persistent "go deeper" affordance while peeling; empty once fully open
  $("rdFoot").innerHTML = (rdRevealed<total)
    ? '<button class="btn wide rddeeper" id="rdDeeper"><span>Go deeper</span><span class="rddsub">'+esc(layers[rdRevealed].t||'')+' · '+(rdRevealed+1)+' of '+total+'</span></button>'
    : '';
  const dp=$("rdDeeper"); if(dp) dp.onclick=()=>{ rdRevealed++; renderReader(); };
  const lr=$("rdLearn"); if(lr) lr.onclick=()=>{ schedule(rdId,2,true); persistAll(); toast("Added to your web — "+esc(c.title)); renderReader(); };
  const nn=$("rdNext"); if(nn) nn.onclick=readerNext;
  const pv=$("rdPrev"); if(pv) pv.onclick=readerPrev;
  const qz=$("rdQuiz"); if(qz) qz.onclick=()=>readerQuiz(c);
}
function readerQuiz(c){
  const qz=pickQuiz(c); if(!qz) return; let answered=null;
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
      // retrieval feeds the invisible scheduler — no points, no streak, no toast
      if(isLearned(rdId)) schedule(rdId, answered===qz.answer?2:1, false);
      persistAll();
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

// zero-friction launch: drop straight into the first "For you" card (not the list overview),
// with the rest of the feed queued behind it for "Next concept →". Close to see the feed.
function openFirstFeedCard(){
  const list=feedCandidates(); if(!list.length) return;
  feedOrder=list.map(c=>c.id); feedReaderList=feedOrder.slice();
  openReader(feedOrder[0]);
}

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
  document.querySelectorAll("#dbSideSeg .s").forEach(s=> s.onclick=()=>{ dbSide=s.dataset.side; renderDebate(); });
  document.querySelectorAll("#dbBody .argcard").forEach(el=> el.onclick=()=>openCard(el.dataset.id));
}
function pickMotion(id){ dbMotion=id; dbSide="for"; renderDebate(); }

// ================= YOU =================
function renderMe(){
  // profile — no level/XP; what you've built is the web, summarised here
  const initials=(settings.name||'').trim().split(/\s+/).filter(Boolean).map(s=>s[0]).slice(0,2).join('').toUpperCase()||'🙂';
  const learned=learnedIds().length, fieldsStarted=new Set(learnedIds().map(id=>byId[id].field)).size;
  $("meProfile").innerHTML='<div class="pcav">'+esc(initials)+'</div><div style="flex:1;min-width:0;"><div class="pcname">'+(esc(settings.name)||'Set your name')+'</div><div class="pchint">'+(learned? (learned+' card'+(learned===1?'':'s')+' in your web · '+fieldsStarted+' field'+(fieldsStarted===1?'':'s')) : 'Your web is empty — pull a thread to begin')+'</div></div>';
  $("meProfile").onclick=()=>{ openSheet("Settings"); };
  // field balance (a coverage breakdown; the web is the full map)
  drawFieldRadar();
  $("meRadarFoot").textContent = (learned? (fieldsStarted+' of '+KN.fields.length+' fields started') : 'Learn cards to grow your field balance.')+' · Tap to see the breakdown.';
  renderObjUI();
}
function renderObjUI(){
  document.querySelectorAll("#objChips .chip").forEach(ch=> ch.classList.toggle("on", ch.dataset.v===settings.objective));
  $("objSub").textContent=' — '+({everything:"Learn everything",general:"General foundations",specialise:"Specialise",debate:"Debate prep",sharp:"Stay sharp"}[settings.objective]||'');
  $("focusChips").innerHTML=KN.fields.map(f=>'<button class="chip'+((settings.focus||[]).includes(f.id)?' on':'')+'" data-f="'+f.id+'">'+esc(f.icon)+' '+esc(f.label)+'</button>').join('');
  document.querySelectorAll("#focusChips .chip").forEach(ch=> ch.onclick=()=>{ const f=ch.dataset.f; settings.focus=settings.focus||[];
    const i=settings.focus.indexOf(f); if(i>=0) settings.focus.splice(i,1); else { if(settings.focus.length>=3){ toast("Up to 3 focus fields"); return; } settings.focus.push(f); }
    persistAll(); renderObjUI(); setSub(); });
}

// ================= canvas drawing =================
function drawRing(cv, frac, opt){ if(!cv) return; const ctx=cv.getContext("2d"); const w=cv.width, h=cv.height, cx=w/2, cy=h/2, r=w*0.4;
  ctx.clearRect(0,0,w,h); ctx.lineWidth=w*0.085; ctx.lineCap="round";
  const css=getComputedStyle(document.documentElement);
  ctx.strokeStyle=css.getPropertyValue('--track')||'#eee'; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  const grad=ctx.createLinearGradient(0,0,w,h); grad.addColorStop(0,"#ff7a18"); grad.addColorStop(1,"#ff2f3d");
  ctx.strokeStyle=grad; ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(frac,0,1)); ctx.stroke();
}
function drawFieldRadar(){ try{ const cv=$("fieldRadar"); if(!cv) return; const ctx=cv.getContext("2d");
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
}catch(e){ console.error('[clue] drawFieldRadar failed:', e); } }
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

// ================= THE WEB (your living knowledge map — North star) =================
// Renders ONLY your known region + its frontier, so it never becomes a hairball:
//  - learned cards  = bright field-coloured nodes
//  - due-for-refresh = faded nodes (the soft-retrieval invitation)
//  - frontier        = dim hollow stubs (unlearned neighbours of what you know — the open loops)
// Deterministic cluster layout (no physics): fields sit around a circle, their cards spiral
// out from the field centroid. Pan by dragging; tap a node to open it.
let webPan={x:0,y:0}, webZoom=1, _webNodes=[], _webView=null;
function neighborsOf(id){ const c=byId[id]; if(!c) return []; return [...(c.prereq||[]),...(c.xref||[])].filter(n=>byId[n]&&n!==id); }
function buildWebNodes(){
  const learned=new Set(learnedIds());
  const shown=new Map();                 // id -> state
  learned.forEach(id=> shown.set(id, isDue(id)?'due':'learned'));
  // frontier: unlearned neighbours of learned cards (the threads to pull)
  if(learned.size){
    learned.forEach(id=> neighborsOf(id).forEach(n=>{ if(!learned.has(n)&&!shown.has(n)) shown.set(n,'frontier'); }));
  } else {
    // cold start: seed with foundational cards (no prereqs) so there's something to pull
    KN.cards.filter(c=>!(c.prereq||[]).length).slice(0,24).forEach(c=> shown.set(c.id,'frontier'));
  }
  // group by field, lay each field's nodes on a spiral around a centroid on a big circle
  const fids=[...new Set([...shown.keys()].map(id=>byId[id].field))];
  const FR=Math.max(150, fids.length*42);          // field-ring radius
  const nodes=[]; const pos={};
  fids.forEach((f,fi)=>{
    const a=-Math.PI/2 + fi/fids.length*Math.PI*2;
    const fcx=Math.cos(a)*FR, fcy=Math.sin(a)*FR;
    const ids=[...shown.keys()].filter(id=>byId[id].field===f).sort((x,y)=>hashStr(x)-hashStr(y));
    ids.forEach((id,i)=>{
      const ring=Math.floor((Math.sqrt(i+0.5))*1.6), step=2.399963*i;     // golden-angle phyllotaxis
      const rr=ring? 30+Math.sqrt(i)*16 : 0;
      const x=fcx+Math.cos(step)*rr, y=fcy+Math.sin(step)*rr;
      pos[id]={x,y};
      nodes.push({id, state:shown.get(id), field:f, x, y});
    });
  });
  // edges between shown nodes (prereq + xref), de-duped
  const edges=[], seen=new Set();
  nodes.forEach(n=> neighborsOf(n.id).forEach(m=>{ if(!pos[m]) return; const k=n.id<m?n.id+'|'+m:m+'|'+n.id; if(seen.has(k)) return; seen.add(k);
    edges.push({a:pos[n.id], b:pos[m], dim:(shown.get(n.id)==='frontier'||shown.get(m)==='frontier')}); }));
  _webNodes=nodes;
  return {nodes, edges};
}
function drawWeb(){ try{
  const cv=$("webCanvas"); if(!cv) return;
  const DPR=2, cssW=cv.clientWidth||$("pageLearn").clientWidth||window.innerWidth, cssH=cv.clientHeight||clamp(window.innerHeight*0.78,360,1000);
  if(cv.width!==cssW*DPR||cv.height!==cssH*DPR){ cv.width=cssW*DPR; cv.height=cssH*DPR; }
  const ctx=cv.getContext("2d"); ctx.setTransform(DPR,0,0,DPR,0,0); ctx.clearRect(0,0,cssW,cssH);
  const css=getComputedStyle(document.documentElement);
  const l3=(css.getPropertyValue('--l3')||'#999').trim();
  const {nodes,edges}=buildWebNodes();
  // auto-fit: scale + centre the graph's bounding box into the canvas, then apply the user's zoom/pan
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  nodes.forEach(n=>{ if(n.x<minX)minX=n.x; if(n.x>maxX)maxX=n.x; if(n.y<minY)minY=n.y; if(n.y>maxY)maxY=n.y; });
  if(!nodes.length){ minX=maxX=minY=maxY=0; }
  const bw=Math.max(1,maxX-minX), bh=Math.max(1,maxY-minY), pad=64;
  const fit=clamp(Math.min((cssW-pad*2)/bw,(cssH-pad*2)/bh), 0.25, 3.2);
  const scale=fit*webZoom, gcx=(minX+maxX)/2, gcy=(minY+maxY)/2;
  const SX=x=>(x-gcx)*scale + cssW/2 + webPan.x, SY=y=>(y-gcy)*scale + cssH/2 + webPan.y;
  _webView={scale,gcx,gcy,cssW,cssH};
  // edges
  edges.forEach(e=>{ ctx.beginPath(); ctx.moveTo(SX(e.a.x),SY(e.a.y)); ctx.lineTo(SX(e.b.x),SY(e.b.y));
    ctx.strokeStyle=e.dim?hexA('#888888',0.12):hexA('#888888',0.32); ctx.lineWidth=e.dim?1:1.4; ctx.stroke(); });
  // nodes — radii are fixed in screen px so they stay tappable & legible at any zoom
  ctx.textAlign="center"; ctx.textBaseline="top"; ctx.font='600 12px -apple-system,sans-serif';
  const showLabels = scale>=0.5;
  nodes.forEach(n=>{ const c=byId[n.id], fl=fieldById[n.field]||{color:'#888'}, col=(fl.color||'#888').trim();
    const x=SX(n.x), y=SY(n.y); let r;
    if(n.state==='frontier'){ r=6; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=hexA(col,0.10); ctx.fill(); ctx.strokeStyle=hexA(col,0.5); ctx.lineWidth=1.6; ctx.setLineDash([2,3]); ctx.stroke(); ctx.setLineDash([]); }
    else if(n.state==='due'){ r=9; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=hexA(col,0.35); ctx.fill(); ctx.strokeStyle=hexA(col,0.65); ctx.lineWidth=1.6; ctx.stroke(); }
    else { r=9; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=col; ctx.fill(); }
    n._sx=x; n._sy=y; n._r=r;
    if(showLabels && n.state!=='frontier'){ const t=(c.title||'').length>18?c.title.slice(0,17)+'…':c.title; ctx.fillStyle=l3; ctx.fillText(t, x, y+r+3); }
  });
}catch(e){ console.error('[clue] drawWeb failed:', e); } }
function renderWeb(){
  $("lnTitle").textContent="Web";
  const sub=$("lnSub"); const learned=learnedIds().length;
  if(sub) sub.textContent = learned? (learned+' learned · pinch to zoom, drag to explore') : 'Tap a glowing thread to begin your web';
  $("lnSessBar").style.display="none"; $("lnPhase").style.display="none";
  const restart=$("lnRestart"); if(restart) restart.style.display="none";
  if(!KN.cards.length){ $("lnStage").innerHTML='<div class="emptystate"><div class="ei">🕸️</div><p>The library didn’t load.</p></div>'; return; }
  $("lnStage").innerHTML='<div class="webwrap"><canvas id="webCanvas"></canvas></div>';
  webZoom=1; webPan={x:0,y:0};                 // open fitted every time — zero friction
  const cv=$("webCanvas"); if(!cv){ drawWeb(); return; }
  const rect=()=>cv.getBoundingClientRect();
  const dist=(a,b)=>Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
  const mid=(a,b)=>{ const r=rect(); return {x:(a.clientX+b.clientX)/2-r.left, y:(a.clientY+b.clientY)/2-r.top}; };
  let px=0,py=0,ox=0,oy=0,down=false,moved=0,mode=null,pinchD=0,pinchZ=1,pinchM=null;
  function startPinch(t0,t1){ mode='pinch'; pinchD=dist(t0,t1); pinchZ=webZoom; pinchM=mid(t0,t1); }
  function onPinch(t0,t1){
    const d=dist(t0,t1); if(pinchD<=0) return;
    const nz=clamp(pinchZ*(d/pinchD), 0.4, 6);
    // keep the layout point under the pinch midpoint stationary while zooming
    const v=_webView; if(v){ const Lx=(pinchM.x - v.cssW/2 - webPan.x)/v.scale + v.gcx, Ly=(pinchM.y - v.cssH/2 - webPan.y)/v.scale + v.gcy;
      const ns=(v.scale/webZoom)*nz; webPan.x=pinchM.x - v.cssW/2 - (Lx-v.gcx)*ns; webPan.y=pinchM.y - v.cssH/2 - (Ly-v.gcy)*ns; }
    webZoom=nz; drawWeb();
  }
  const xy=t=>{ const r=rect(); return {x:t.clientX-r.left, y:t.clientY-r.top}; };
  cv.addEventListener("touchstart",e=>{ if(e.touches.length>=2){ startPinch(e.touches[0],e.touches[1]); return; }
    const p=xy(e.touches[0]); px=p.x; py=p.y; ox=webPan.x; oy=webPan.y; down=true; moved=0; mode='pan'; },{passive:true});
  cv.addEventListener("touchmove",e=>{ if(mode==='pinch'&&e.touches.length>=2){ onPinch(e.touches[0],e.touches[1]); if(e.cancelable)e.preventDefault(); return; }
    if(!down) return; const p=xy(e.touches[0]); const dx=p.x-px,dy=p.y-py; moved=Math.max(moved,Math.abs(dx)+Math.abs(dy)); webPan.x=ox+dx; webPan.y=oy+dy; drawWeb(); if(e.cancelable)e.preventDefault(); },{passive:false});
  cv.addEventListener("touchend",e=>{ if(mode==='pinch'){ if(e.touches.length===0) mode=null; return; }
    if(!down) return; down=false; if(moved>9){ mode=null; return; }    // it was a pan, not a tap
    const t=e.changedTouches[0]; const p=xy(t); hitTap(p.x,p.y); mode=null; },{passive:true});
  // desktop: drag to pan, wheel to zoom, click to open
  cv.addEventListener("mousedown",e=>{ const p=xy(e); px=p.x; py=p.y; ox=webPan.x; oy=webPan.y; down=true; moved=0; });
  cv.addEventListener("mousemove",e=>{ if(!down) return; const p=xy(e); const dx=p.x-px,dy=p.y-py; moved=Math.max(moved,Math.abs(dx)+Math.abs(dy)); webPan.x=ox+dx; webPan.y=oy+dy; drawWeb(); });
  cv.addEventListener("mouseup",e=>{ if(!down) return; down=false; if(moved>9) return; const p=xy(e); hitTap(p.x,p.y); });
  cv.addEventListener("wheel",e=>{ e.preventDefault(); const v=_webView; if(!v) return; const r=rect(); const m={x:e.clientX-r.left,y:e.clientY-r.top};
    const nz=clamp(webZoom*(e.deltaY<0?1.12:0.89),0.4,6); const Lx=(m.x-v.cssW/2-webPan.x)/v.scale+v.gcx, Ly=(m.y-v.cssH/2-webPan.y)/v.scale+v.gcy;
    const ns=(v.scale/webZoom)*nz; webPan.x=m.x-v.cssW/2-(Lx-v.gcx)*ns; webPan.y=m.y-v.cssH/2-(Ly-v.gcy)*ns; webZoom=nz; drawWeb(); },{passive:false});
  function hitTap(mx,my){ let hit=null,best=1e9; _webNodes.forEach(n=>{ const d=Math.hypot(mx-n._sx,my-n._sy); if(d<(n._r||7)+12 && d<best){best=d; hit=n;} }); if(hit) openCard(hit.id); }
  drawWeb();
}

// ================= appearance =================
function applyTheme(){ const m=settings.theme||'auto';
  const dark = m==='dark' || (m!=='light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark',dark);
  document.documentElement.style.background = dark?'#000':'#f2f2f7';
  document.querySelectorAll("#themeSeg .s").forEach(s=> s.classList.toggle("active", s.dataset.theme===m));
}

// ================= persistence helpers =================
function persistAll(){ sset("settings",settings); sset("progress",progress); }
function refreshAll(){ safe(renderFeed,'feed'); safe(renderMe,'me'); if($("sheetLibrary").classList.contains("show")) safe(renderLibList,'library'); }

// ================= onboarding =================
function renderOnboarding(step){
  step=step||1;
  const ob=$("obCard");
  if(step===1){
    ob.innerHTML=`<div class="obbrand"><span class="wordmark">Clue</span></div>
      <p class="obtag">A feed for your brain. Scroll real ideas across every field, tap to go as deep as you like — from the basics to where the experts still disagree. No streaks, no targets — just follow your curiosity.</p>
      <div class="oblabel">First, your name</div>
      <input id="obName" type="text" autocapitalize="words" placeholder="Your first name">
      <button class="btn wide" id="obNext" style="margin-top:18px;">Continue</button>`;
    $("obName").value=settings.name||"";
    $("obNext").onclick=()=>{ settings.name=($("obName").value||"").trim().slice(0,24); renderOnboarding(2); };
  } else if(step===2){
    const opts=[{v:"everything",b:"Just show me everything",s:"No focus needed — explore it all, from the basics up"},
                {v:"specialise",b:"Specialise",s:"Go deep in the fields you choose"},
                {v:"debate",b:"Debate prep",s:"Arguments, evidence and rebuttals"},
                {v:"sharp",b:"Stay sharp",s:"Resurface what you’ve seen so it sticks"}];
    ob.innerHTML=`<div class="obtitle">How do you want to learn?</div>
      <p class="obp">This only nudges what your feed surfaces — change it or ignore it anytime in You. Not sure? Leave it on “everything”.</p>
      <div class="obopts">${opts.map(o=>'<button class="obopt'+(settings.objective===o.v?' on':'')+'" data-v="'+o.v+'"><b>'+o.b+'</b><span>'+o.s+'</span></button>').join('')}</div>
      <button class="btn wide" id="obNext" style="margin-top:18px;">Continue</button>`;
    document.querySelectorAll("#obCard .obopt").forEach(o=> o.onclick=()=>{ settings.objective=o.dataset.v; document.querySelectorAll("#obCard .obopt").forEach(x=>x.classList.toggle("on",x===o)); });
    $("obNext").onclick=()=> renderOnboarding(3);
  } else {
    ob.innerHTML=`<div class="obtitle">Pick a few favourites</div>
      <p class="obp">Fields you tap show up more often in your feed. Optional — skip to get a balanced mix.</p>
      <div class="chips wrap" id="obFocus">${KN.fields.map(f=>'<button class="chip'+((settings.focus||[]).includes(f.id)?' on':'')+'" data-f="'+f.id+'">'+esc(f.icon)+' '+esc(f.label)+'</button>').join('')}</div>
      <button class="btn wide" id="obDone" style="margin-top:18px;">Start learning</button>`;
    document.querySelectorAll("#obFocus .chip").forEach(ch=> ch.onclick=()=>{ const f=ch.dataset.f; settings.focus=settings.focus||[]; const i=settings.focus.indexOf(f); if(i>=0) settings.focus.splice(i,1); else { if(settings.focus.length>=3){ toast("Up to 3"); return; } settings.focus.push(f); } ch.classList.toggle("on"); });
    $("obDone").onclick=async()=>{ settings.onboarded=true; await persistAll(); $("onboardWrap").classList.remove("show"); refreshAll(); openFirstFeedCard(); };
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
  $("resetBtn").onclick=async()=>{ if(!confirm("Reset your whole web? Every card goes back to unlearned. Your library stays. This cannot be undone.")) return;
    progress={}; settings=Object.assign(settings,{ saved:[], fotd:null });
    await persistAll(); toast("Your web was reset"); refreshAll(); renderWeb(); };
}
function renderAbout(){ $("aboutBody").innerHTML='<p style="font-size:14px;color:var(--l2);line-height:1.55;margin:14px 0;">'+
  '<b>Clue</b> is a place to follow ideas as far as you like. Scroll the feed, pull a thread, and watch your web of understanding grow — no streaks, no targets, no homework. What you learn quietly resurfaces so it sticks, and you can assemble the facts into a case in Debate mode.</p>'+
  '<p style="font-size:14px;color:var(--l2);line-height:1.55;">'+KN.cards.length+' cards across '+KN.fields.length+' fields in this build. Content is a curated seed — verify and expand it in <b>knowledge.json</b>.</p>'; }
async function doExport(){ const blob=new Blob([JSON.stringify({ _app:"clue", _v:1, when:new Date().toISOString(), settings, progress },null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="debate-backup-"+todayStr()+".json"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast("Backup downloaded"); }
function doImport(e){ const f=e.target.files&&e.target.files[0]; if(!f) return; const r=new FileReader();
  r.onload=async()=>{ try{ const d=JSON.parse(r.result); if(d.settings) settings=Object.assign(settings,d.settings); if(d.progress) progress=d.progress; await persistAll(); applyTheme(); toast("Backup restored"); refreshAll(); renderWeb(); }catch(err){ toast("Couldn’t read that file"); } };
  r.readAsText(f); e.target.value=""; }

// ================= pages / tab bar / swipe pager =================
function showTab(name){
  if(window.__revealBar) window.__revealBar();
  document.querySelectorAll(".page").forEach(p=> p.classList.toggle("active", p.dataset.tab===name));
  document.querySelectorAll(".tabitem").forEach(t=> t.classList.toggle("active", t.dataset.tab===name));
  if(window.__pageGo) window.__pageGo(name); else { try{ window.scrollTo(0,0); }catch(e){} }
  if(name==="feed") safe(renderFeed,'feed');
  else if(name==="learn") safe(renderWeb,'web');
  else if(name==="debate") safe(renderDebate,'debate');
  else if(name==="me") safe(renderMe,'me');
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
  // objective chips (a soft feed-weighting preference — no targets, no achievements)
  document.querySelectorAll("#objChips .chip").forEach(ch=> ch.onclick=()=>{ settings.objective=ch.dataset.v; persistAll(); renderObjUI(); renderFeed(); });
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
  const ORDER=["learn","feed","debate","me"];
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
  const EDGE=32;   // px from either side where a horizontal page-turn wins more readily (iOS-style)
  let x0=0,y0=0,armed=false,locked=false,dragging=false,lastX=0,lastT=0,vx=0,fromEdge=false;
  pager.addEventListener("touchstart",e=>{ if(e.touches.length!==1||document.querySelector(".sheet.show, #onboardWrap.show, .reader.show")||blocked(e.target)){ armed=false; return; }
    cancelAnimationFrame(raf); x0=lastX=e.touches[0].clientX; y0=e.touches[0].clientY; fromEdge=(x0<EDGE||x0>W()-EDGE); lastT=Date.now(); vx=0; armed=true; locked=false; dragging=false; track.style.transition="none"; },{passive:true});
  pager.addEventListener("touchmove",e=>{ if(!armed) return; const x=e.touches[0].clientX,y=e.touches[0].clientY,dx=x-x0,dy=y-y0;
    // Lock to a horizontal page-turn at the natural 45° boundary (adx>ady); from a screen edge,
    // lock with far less horizontal dominance so the gesture is reliable on the scrollable feed.
    if(!locked){ const adx=Math.abs(dx),ady=Math.abs(dy); if(adx<5&&ady<5) return; const ratio=fromEdge?0.4:1.0; if(adx<=ady*ratio){ armed=false; return; } locked=true; dragging=true; }
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
  await persistAll();
  safe(wireNav,'wireNav'); safe(wireSettings,'wireSettings');
  safe(renderWeb,'web'); safe(renderFeed,'feed'); safe(renderMe,'me'); safe(updateRotateGuard,'rotate');
  if(ok && !settings.onboarded){ renderOnboarding(1); $("onboardWrap").classList.add("show"); }
  else if(ok){ openFirstFeedCard(); }
  hideSplash();
}
let splashGone=false;
function hideSplash(){ if(splashGone) return; splashGone=true; const s=$("splash"); if(s){ s.classList.add("gone"); setTimeout(()=>s.remove(),500); } if(window.__barMeasure) window.__barMeasure(); }
setTimeout(hideSplash, 4000);   // backstop so a thrown init never traps the splash
// register service worker
if("serviceWorker" in navigator){ window.addEventListener("load",()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); }); }
init();
