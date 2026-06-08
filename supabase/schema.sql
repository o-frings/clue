-- Clue — accounts & sync schema (run once in your Supabase project's SQL Editor)
-- Same structure as Yalla: a private per-key store + a profile row, both owner-only via RLS.
-- The anon/public key is safe to ship in the client; security is enforced by these policies,
-- not by hiding the key.

-- Table 1 — user_data: private personal data, one row per (user, key).
-- Maps 1:1 onto the app's sget/sset calls. Last-write-wins per key via updated_at.
create table if not exists public.user_data (
  user_id    uuid not null references auth.users on delete cascade,
  key        text not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_data enable row level security;

-- Owner-only: you can read/write ONLY your own rows. This is the security boundary.
drop policy if exists "own rows" on public.user_data;
create policy "own rows" on public.user_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Table 2 — profiles: a display name keyed to the stable auth user id (never to email).
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Owner-only (private by default). Widen this later only if you add a shared/social feed.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
