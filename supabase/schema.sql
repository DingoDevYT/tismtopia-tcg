-- Tismtopia TCG: Supabase schema (accounts, cloud saves, private card submissions).
-- Run it in the dashboard: SQL Editor > New query > paste this file > Run. Written for a fresh project; running it again is harmless.
-- Needs no service key: the game only ever uses the publishable key, and Row Level Security below decides what each user may touch.
--
-- Manual dashboard steps (once):
--   1. Authentication > Sign In / Providers > Discord: turn it on and paste the Client ID and Client Secret from the
--      Discord Developer Portal (your app > OAuth2). In Discord, add this redirect: https://<project-ref>.supabase.co/auth/v1/callback
--   2. Authentication > URL Configuration: Site URL = https://dingodevyt.github.io/tismtopia-tcg/
--      Redirect URLs: add http://localhost:8123/ (local testing) and https://dingodevyt.github.io/tismtopia-tcg/
--   3. Reviewing submissions: Table Editor > submissions (you see every row there; players only see their own).
--      Card pictures are in Storage > submissions, one folder per player id. Change `status` to approved / rejected by hand.

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text check (char_length(name) <= 64),
  avatar text check (char_length(avatar) <= 512),
  created_at timestamptz not null default now()
);

create table if not exists public.saves (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 200 * 1024),
  updated_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  card jsonb not null check (jsonb_typeof(card) = 'object' and pg_column_size(card) <= 20 * 1024),
  image_path text check (char_length(image_path) <= 200),
  note text check (char_length(note) <= 300)
);
create index if not exists submissions_user_idx on public.submissions (user_id, created_at desc);

-- ---------- who may do what: signed-out visitors nothing, signed-in players only their own rows ----------
revoke all on public.profiles, public.saves, public.submissions from anon, authenticated;
grant select, insert, update on public.profiles, public.saves to authenticated;
grant select, insert on public.submissions to authenticated; -- no update/delete: only the owner (dashboard) changes a submission

alter table public.profiles enable row level security;
alter table public.saves enable row level security;
alter table public.submissions enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "saves: read own" on public.saves;
drop policy if exists "saves: insert own" on public.saves;
drop policy if exists "saves: update own" on public.saves;
create policy "saves: read own" on public.saves for select to authenticated using ((select auth.uid()) = user_id);
create policy "saves: insert own" on public.saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saves: update own" on public.saves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- A player can only file a pending card under their own id, with its picture in their own storage folder.
drop policy if exists "submissions: insert own" on public.submissions;
drop policy if exists "submissions: read own" on public.submissions;
create policy "submissions: insert own" on public.submissions for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending'
    and (image_path is null or image_path like (select auth.uid())::text || '/%'));
create policy "submissions: read own" on public.submissions for select to authenticated using ((select auth.uid()) = user_id);

-- ---------- triggers ----------
-- The server stamps every save, so "which copy is newer" never depends on a phone's clock.
create or replace function public.saves_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before insert or update on public.saves for each row execute function public.saves_touch();

-- At most 20 cards waiting for review per player (the lock stops two quick submits slipping past together).
create or replace function public.submissions_limit() returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if (select count(*) from public.submissions where user_id = new.user_id and status = 'pending') >= 20 then
    raise exception 'You already have 20 cards waiting for review.';
  end if;
  return new;
end $$;
drop trigger if exists submissions_limit on public.submissions;
create trigger submissions_limit before insert on public.submissions for each row execute function public.submissions_limit();

-- ---------- storage: private bucket for submitted card art ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "submission art: upload own" on storage.objects;
drop policy if exists "submission art: read own" on storage.objects;
create policy "submission art: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "submission art: read own" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[1] = (select auth.uid())::text);
