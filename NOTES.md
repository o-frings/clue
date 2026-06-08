# Clue — developer notes

Scaffold of a knowledge/debate trainer, derived from `../yalla`. Same architecture:
single-file PWA, vanilla JS, no build step, local-first storage, optional dormant
Supabase sync, iOS-native look with a four-page swipe pager.

## Mapping from Yalla

| Yalla | Debate |
|---|---|
| `evidence.json` (studies + advice) | `knowledge.json` (fields + cards + motions) |
| Workout → log sets | Learn → Discover / Review / Quiz |
| Muscle-balance radar | Field-balance radar |
| Progress charts (volume) | Activity chart (cards/day) |
| Coaching objective / focus / weak spots | Learning objective / focus fields / pace |
| Achievements, streak, celebrate/toast | same, retuned for learning |
| Tabs: Overview · Workout · Me | Tabs: Today · Learn · Debate · Me |
| Library sheet | Library sheet (browse/search all cards) |

## Data model

- `knowledge.json` → `{ fields[], depths[], cards[], motions[] }`.
  - **card**: `{id, field, depth(fact|event|concept|book), level(1–3), title, fact,
    detail, source{who,year,title,where,url}, year?, tags[], deploy, counter, quiz?{q,choices[],answer}}`.
  - `deploy` = how to use it in an argument; `counter` = the steelman/caveat (also
    the "against" side in Debate mode).
- `progress` (persisted) → `cardId → {ease, interval(days), due(ms), reps, lapses, learned, seen, last}`.
- `settings` (persisted) → name, objective, focus[], pace, theme, xp, streak,
  bestStreak, lastSessionDay, daily{day,count}, activity{day→{l,r,q}}, counters, fotd, onboarded.

## Spaced repetition

`schedule(id, q)` in app.js — SM-2-lite. q: 0 Again · 1 Hard · 2 Good · 3 Easy.
Again resurfaces within the session (due +60s) and drops ease; Good/Easy grow the
interval by ease factor. A quiz miss reschedules the card as "Hard".

## Session

`startSession()` builds Review (all due, cap 40) + Discover (today's remaining new,
= pace − daily.count). Phase order **Review → Discover → Quiz**; the quiz pool is
built from cards learned this session + already-learned cards that have a `quiz`.

## XP / level / streak

`awardXp()`; `levelFor(xp)=floor(sqrt(xp/100))+1` (L2@100, L5@1600). `touchDay()`
updates the day-streak and the activity map on the first action of each day.

## Gamification knobs

- `ACHIEVEMENTS[]` — id/icon/title/desc/test(stats). `checkAchievements()` after
  each action; new unlocks celebrate + toast.
- Discover weighting: `candidateScore(c)` blends level (easier first), focus-field
  bonus, and objective bonus. `general`/`sharp` round-robin across fields for spread.

## Canvas

`drawRing` (streak), `drawFieldRadar` (Me), `drawProgress` (activity bars). Canvases
use 2× attribute resolution scaled down by CSS for crispness — no devicePixelRatio
juggling. Colours pulled from CSS custom properties at draw time (theme-aware).

## Dormant cloud (`SUPA` in app.js)

Blank keys ⇒ `cloudConfigured()` false ⇒ everything local, the Account panel says
"local only". To enable: set `SUPA.url/key`, create a Supabase `kv` table
`(user_id uuid, k text, v jsonb, updated_at timestamptz, primary key(user_id,k))`,
flesh out `cloudMark`/`__cloudInit`/auth, and reconcile `CLOUD_KEYS` last-write-wins.

## Tested

`/tmp/smoke.js` runs app.js under DOM stubs (no browser available here): init,
knowledge load, dashboard renders, a full session (discover→quiz→done), SRS
scheduling, debate case-building, and Library all pass (19/19). For visual/touch
QA, open in Safari and Add to Home Screen.

## Next obvious steps

- Grow `knowledge.json` to hundreds of cards (keep `counter` honest + sources real).
- Per-card "explain like I'm arguing this" / longer book summaries.
- Debate mode: timed drills, claim→evidence chaining, a saved "case" you can review.
- Push reminders for due reviews (sw.js `push` handler is ready; needs a server).
- Turn on cloud sync + friends (leaderboards, shared decks) per the Yalla pattern.
