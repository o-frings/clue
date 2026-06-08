# Clue — setup & deployment

A gamified knowledge & debate trainer. Learn facts and deeper ideas across many
fields, lock them in with spaced repetition, and assemble them into arguments.
Built as an offline-first PWA on the **Yalla** blueprint — same look, same
zero-build, install-to-home-screen model. *"Clue" is a working name.*

---

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | The whole app shell (4 tabs, sheets, onboarding). |
| `app.css` | All styling (Yalla's iOS design language + the card/quiz/debate pieces). |
| `app.js` | The engine: storage, spaced repetition, the Learn loop, Clue mode, gamification. |
| `knowledge.json` | The content — fields, cards (each with a debate layer), and debate motions. **This is what you grow.** |
| `sw.js` | Service worker — instant load + full offline. |
| `manifest.webmanifest` | App name, icon, colours. |
| `icon-1024.png` / `icon.svg` | The app icon (open book + insight spark). |

---

## Run it locally

It must be served over http (not opened as a `file://`) so `knowledge.json` can load:

```bash
cd /Users/oliverfrings/Projects/debate
python3 -m http.server 8765
# then open http://localhost:8765 in Safari/Chrome
```

On iPhone, open the URL in **Safari → Share → Add to Home Screen** for the
full-screen, offline app.

---

## Put it online (GitHub Pages) — same as Yalla

1. Create a public repo, upload `index.html`, `app.css`, `app.js`, `sw.js`,
   `manifest.webmanifest`, `icon-1024.png`, `icon.svg`, `knowledge.json`.
2. **Settings → Pages → Deploy from branch → main / root**.
3. Open the green `https://USER.github.io/REPO/` link in Safari, Add to Home Screen.

When you push an update, bump `CACHE` in `sw.js` (`debate-v1` → `debate-v2`) so
everyone gets it on next open.

---

## The core loop

- **Today** — streak, what's due, fact of the day.
- **Learn** — **Discover** new cards → **Review** due cards (rate your recall:
  Again / Hard / Good / Easy, SM-2-style scheduling) → **Quiz** to test it.
- **Clue** — pick a motion; the app builds the strongest *for* and *against*
  points from your library (the `deploy` and `counter` on each card). Cards you've
  learned are unlocked; others are blurred until you learn them.
- **Me** — level/XP, a field-balance radar (which fields you're building),
  activity chart, your objective & focus fields, achievements.

## Adding knowledge

Open `knowledge.json` and add cards to the `cards` array. Every card carries a
**debate layer**: `deploy` (how to use it in an argument) and `counter` (the
honest steelman/caveat). Keep facts accurate and sourced. See the `_meta` block
in that file for the schema and rules. This seed has ~37 cards across 11 fields;
the goal is hundreds.

## Cloud sync & friends

Scaffolded but **dormant** (like Yalla, with blank Supabase keys). To switch on,
fill `SUPA.url`/`SUPA.key` in `app.js` and add a `kv` table; sync is last-write-
wins per key over `["settings","progress"]`. See `NOTES.md`.
