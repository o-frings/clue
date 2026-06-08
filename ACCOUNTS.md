# Clue accounts & sync

Same account structure as Yalla: the app stays offline-first (localStorage is the live
store), and Supabase is a sync layer on top. Sign in with an emailed code, and your
progress follows you across devices. No server to run — GitHub Pages serves the app and
it talks to Supabase over the network.

## How it works

- **Offline-first stays.** The app reads/writes localStorage instantly and works with no
  network. Supabase is never the source of truth at read time.
- **Private by default.** Every row is readable only by its owner (Postgres row-level
  security). See [`supabase/schema.sql`](supabase/schema.sql).
- **Feature-flagged.** With blank keys (the default) the cloud layer is dormant and the
  app is 100% local. Add the two keys and accounts turn on. Nothing breaks either way.
- **Auth:** email magic-link as a 6-digit **code** (passwordless). A link would open
  Safari and miss an installed PWA, so we verify a code instead.
- **Sync:** last-write-wins per key (`settings`, `progress`) via an `updated_at` stamp.
  On launch and sign-in the client reconciles: newest copy of each key wins.
- **`user_id`** (a stable UUID from `auth.users`) keys everything — never the email.

## One-time setup (~15 min of click-ops)

1. Go to <https://supabase.com> → sign up → **New project** (pick a region near you, save
   the DB password).
2. **SQL Editor** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Project Settings → API** → copy the **Project URL** and the **anon / public key**.
4. Put them in the `SUPA` block near the top of [`app.js`](app.js):
   ```js
   const SUPA = { url: "https://YOURPROJECT.supabase.co", key: "YOUR-ANON-KEY" };
   ```
   (Send me the two values and I'll wire them in.) The anon key is *designed* to ship in
   client code — it's safe to commit.
5. **Authentication → URL Configuration** (required, or login fails):
   - **Site URL** = `https://o-frings.github.io/clue/`
   - **Redirect URLs** = add the same URL (plus any local test origin, e.g.
     `http://localhost:8765`).
   - Supabase's built-in email sender is rate-limited and may land in spam — fine for
     testing; add an SMTP provider for real use.

Then bump the service-worker cache (`clue-vN`) in [`sw.js`](sw.js) and push — the
**Account & sync** section in **Me → settings** becomes a live sign-in.

## Data rights

- **Export / restore** already exist in Me → Your data.
- **Delete my cloud data** (in the signed-in account panel) removes your `user_data` and
  `profiles` rows from the server; the copy on this device stays. Full `auth.users`
  deletion needs an admin/edge-function step — add it if you go public.
