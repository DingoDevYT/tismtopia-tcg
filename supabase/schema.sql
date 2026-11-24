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
--      Card pictures are in Storage > submissions, one folder per player id. Change `status` to approved / rejected by hand,
--      or sign in to the game with an admin account and use Profile > Review submissions (admins: see the end of this file).

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

-- ---------- players view, edit and withdraw their own PENDING submissions (live migration: players_edit_own_pending_submissions) ----------
-- Reviewed rows (approved / rejected) stay read-only for players. Only card, image_path and note can change; status never can.
alter table public.submissions add column if not exists updated_at timestamptz not null default now();
grant update (card, image_path, note, updated_at), delete on public.submissions to authenticated;

drop policy if exists "submissions: update own pending" on public.submissions;
drop policy if exists "submissions: delete own pending" on public.submissions;
create policy "submissions: update own pending" on public.submissions for update to authenticated
  using ((select auth.uid()) = user_id and status = 'pending')
  with check ((select auth.uid()) = user_id and status = 'pending'
    and (image_path is null or image_path like (select auth.uid())::text || '/%'));
create policy "submissions: delete own pending" on public.submissions for delete to authenticated
  using ((select auth.uid()) = user_id and status = 'pending');

create or replace function public.submissions_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists submissions_touch on public.submissions;
create trigger submissions_touch before update on public.submissions for each row execute function public.submissions_touch();

drop policy if exists "submission art: update own" on storage.objects;
drop policy if exists "submission art: delete own" on storage.objects;
create policy "submission art: update own" on storage.objects for update to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "submission art: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- community cards: approved submissions are public (live migrations, applied in the dashboard) ----------
-- Signed-out players read approved cards through approved_cards() and their pictures through this storage rule; everything else stays private.
create or replace function public.is_approved_art(obj text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.submissions s where s.status = 'approved' and (s.image_path = obj or s.card ->> 'cutout' = obj));
$$;
drop policy if exists "submission art: read approved" on storage.objects;
create policy "submission art: read approved" on storage.objects for select to anon, authenticated
  using (bucket_id = 'submissions' and public.is_approved_art(name));

-- ---------- reviewing in the game (js/review.js): admins, 'dev' status, pack and a note to the submitter ----------
-- Add an admin (their id is in Authentication > Users): insert into public.admins values ('<user id>');
create table if not exists public.admins (user_id uuid primary key references auth.users on delete cascade);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
drop policy if exists "admins: read own" on public.admins;
create policy "admins: read own" on public.admins for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

-- status 'dev' = handed to the developer for hand-tuning. pack: null = approved but in no pack yet, else a pack id from js/packs.js
-- (or 'community'). review_note: the reviewer's message, shown to the submitter.
alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check check (status in ('pending', 'approved', 'rejected', 'dev'));
alter table public.submissions add column if not exists pack text;
alter table public.submissions add column if not exists review_note text;
alter table public.submissions drop constraint if exists submissions_pack_check;
alter table public.submissions add constraint submissions_pack_check check (pack is null or pack ~ '^[a-z0-9_-]{1,24}$');
alter table public.submissions drop constraint if exists submissions_review_note_check;
alter table public.submissions add constraint submissions_review_note_check check (char_length(review_note) <= 500);
grant update (status, pack, review_note) on public.submissions to authenticated; -- the guard trigger below keeps these to admins

drop policy if exists "submissions: admin read all" on public.submissions;
drop policy if exists "submissions: admin review" on public.submissions;
create policy "submissions: admin read all" on public.submissions for select to authenticated using ((select public.is_admin()));
create policy "submissions: admin review" on public.submissions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Players may still edit their own pending cards, but only an admin changes status, pack or review_note (dashboard / SQL editor, auth.uid() null, is allowed).
create or replace function public.submissions_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin()
     and (new.status is distinct from old.status or new.pack is distinct from old.pack or new.review_note is distinct from old.review_note) then
    raise exception 'Only a reviewer can change the status, pack or review note.';
  end if;
  return new;
end $$;
drop trigger if exists submissions_guard on public.submissions;
create trigger submissions_guard before update on public.submissions for each row execute function public.submissions_guard();

drop policy if exists "submission art: admin read all" on storage.objects;
create policy "submission art: admin read all" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (select public.is_admin()));

-- The public list the game loads (js/community.js). approved_at is the row's updated_at.
drop function if exists public.approved_cards();
create function public.approved_cards() returns table (id uuid, card jsonb, image_path text, approved_at timestamptz, pack text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.card -> 'card', s.image_path, s.created_at, s.pack -- creation time: card numbers never shift when a pack changes
  from public.submissions s where s.status = 'approved' order by s.created_at;
$$;
grant execute on function public.approved_cards() to anon, authenticated;

-- ---------- members of the Tismtopia Discord server only (live migration, applied in the dashboard) ----------
-- Rows are written only by the Edge Function supabase/functions/verify-member/index.ts (service role), which the game calls right
-- after a Discord sign-in (scope "guilds") and which asks Discord whether the account is in the server. The server id is the GUILD
-- constant in that file. A member stays verified for 30 days; signing in again re-verifies. Signed-out public reads are unchanged.
create table if not exists public.members (
  user_id uuid primary key references auth.users on delete cascade,
  discord_id text not null check (char_length(discord_id) <= 32),
  verified_at timestamptz not null default now()
);
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;
grant select on public.members to authenticated; -- no insert/update/delete: a player cannot mark themselves a member
drop policy if exists "members: read own" on public.members;
create policy "members: read own" on public.members for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.is_member() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.user_id = (select auth.uid()) and m.verified_at > now() - interval '30 days');
$$;
grant execute on function public.is_member() to authenticated;

-- One-off when this went live: everyone who already had an account counts as a member until their next sign-in re-verifies them.
-- insert into public.members (user_id, discord_id, verified_at)
--   select u.id, coalesce(u.raw_user_meta_data ->> 'provider_id', ''), now() from auth.users u
--   on conflict do nothing;

-- Restrictive: on top of the "own row" policies above, a signed-in non-member (admins excepted) can read or write nothing here.
drop policy if exists "members only" on public.profiles;
create policy "members only" on public.profiles as restrictive for all to authenticated
  using ((select public.is_member()) or (select public.is_admin())) with check ((select public.is_member()) or (select public.is_admin()));
drop policy if exists "members only" on public.saves;
create policy "members only" on public.saves as restrictive for all to authenticated
  using ((select public.is_member()) or (select public.is_admin())) with check ((select public.is_member()) or (select public.is_admin()));
drop policy if exists "members only" on public.submissions;
create policy "members only" on public.submissions as restrictive for all to authenticated
  using ((select public.is_member()) or (select public.is_admin())) with check ((select public.is_member()) or (select public.is_admin()));
-- The private bucket too, except approved art (which anyone may see, signed in or not).
drop policy if exists "submission art: members only" on storage.objects;
create policy "submission art: members only" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'submissions' or (select public.is_member()) or (select public.is_admin()) or public.is_approved_art(name))
  with check (bucket_id <> 'submissions' or (select public.is_member()) or (select public.is_admin()));
