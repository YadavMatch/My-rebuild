-- NearMatch — initial schema
--
-- Generated from docs/data-model.md, which explains why it is shaped this
-- way. Run this once in the Supabase SQL editor, or with the Supabase CLI.
--
-- Supabase provides auth.users and auth.uid(); this migration assumes both.
--
-- Safety properties this file is responsible for, all of which are tested
-- in supabase/tests/schema_test.sql:
--   * a blocked person cannot see or reach the other person by any path
--   * matches are created only by the database, never by a client
--   * date of birth and phone are readable only by their owner
--   * verified and tier cannot be set by a client at all
--   * free accounts get 6 likes a day; passes are never capped

begin;

-- Extensions: postgis for proximity, pgcrypto for uuids.
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  name            text not null check (length(name) between 1 and 40),
  -- Maintained nightly from profiles_private.date_of_birth. Storing the age
  -- rather than deriving it per query keeps DOB out of every read path.
  age             int  not null check (age >= 18),
  job_title       text,
  location_label  text,               -- "Indiranagar" — display only
  bio             text check (length(bio) <= 500),
  interests       text[] not null default '{}',
  emoji           text,               -- avatar fallback when there is no photo
  photo_path      text,               -- storage key, never a public URL
  verified        boolean not null default false,
  verified_at     timestamptz,
  geo             geography(point, 4326),   -- never exposed to other users
  is_discoverable boolean not null default true,
  last_active_at  timestamptz not null default now(),
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index on profiles using gist (geo);
create index on profiles using gin (interests);
create index on profiles (last_active_at desc) where deleted_at is null;

-- -------------------------------------------------- private, owner-only

create table profiles_private (
  id                uuid primary key references profiles(id) on delete cascade,
  date_of_birth     date not null,
  -- The timestamped 18+ declaration the app already collects.
  age_confirmed_at  timestamptz not null,
  phone             text unique,
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------- prompts

create table prompts (
  id        serial primary key,
  question  text not null unique,
  active    boolean not null default true
);

create table profile_prompts (
  profile_id  uuid references profiles(id) on delete cascade,
  prompt_id   int  references prompts(id),
  answer      text not null check (length(answer) <= 240),
  position    int  not null default 0,
  primary key (profile_id, prompt_id)
);

-- ------------------------------------------------------------------ swipes

create type swipe_decision as enum ('like', 'pass', 'superlike');

create table swipes (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid not null references profiles(id) on delete cascade,
  target_id  uuid not null references profiles(id) on delete cascade,
  decision   swipe_decision not null,
  created_at timestamptz not null default now(),
  -- This single constraint is what makes "never repeats someone you have
  -- already swiped on" true, rather than a filter the client might forget.
  unique (actor_id, target_id),
  check (actor_id <> target_id)
);

create index on swipes (actor_id, created_at desc);
create index on swipes (target_id) where decision <> 'pass';

-- ----------------------------------------------------------------- matches

create table matches (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references profiles(id) on delete cascade,
  user_b     uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Canonical ordering. Without it, two people liking each other at the same
  -- instant create two rows for one match.
  check (user_a < user_b),
  unique (user_a, user_b)
);

-- ---------------------------------------------------------------- messages

create table messages (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  sender_id  uuid not null references profiles(id) on delete cascade,
  body       text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index on messages (match_id, created_at desc);

-- ------------------------------------------------------------------ safety

create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index on blocks (blocked_id);

create type report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');
create type report_context as enum ('profile', 'conversation');

create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles(id) on delete set null,
  reported_id  uuid not null references profiles(id) on delete cascade,
  context      report_context not null,
  reason       text not null,
  match_id     uuid references matches(id) on delete set null,
  message_id   uuid references messages(id) on delete set null,
  status       report_status not null default 'open',
  created_at   timestamptz not null default now(),
  reviewed_by  uuid,
  reviewed_at  timestamptz
);

create index on reports (status, created_at) where status = 'open';

-- ----------------------------------------------------- verification, billing

-- Deliberately has no column for an image. The check runs, the result is
-- recorded, the photo never reaches the database.
create table verification_attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  passed     boolean not null,
  provider   text not null,
  created_at timestamptz not null default now()
);

create type billing_tier as enum ('free', 'premium');

create table entitlements (
  user_id                 uuid primary key references profiles(id) on delete cascade,
  tier                    billing_tier not null default 'free',
  expires_at              timestamptz,
  store                   text,     -- 'apple' | 'google'
  original_transaction_id text,
  updated_at              timestamptz not null default now()
);

create table push_tokens (
  user_id    uuid not null references profiles(id) on delete cascade,
  token      text not null,
  platform   text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

create or replace function is_blocked(a uuid, b uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

alter table profiles enable row level security;
alter table matches  enable row level security;
alter table messages enable row level security;

create policy profiles_readable on profiles for select using (
  deleted_at is null
  and (id = auth.uid() or not is_blocked(auth.uid(), id))
);

create policy profiles_self_write on profiles for update using (id = auth.uid())
  with check (id = auth.uid());

create policy matches_mine on matches for select using (
  (user_a = auth.uid() or user_b = auth.uid())
  and not is_blocked(user_a, user_b)
);

create policy messages_in_my_matches on messages for select using (
  exists (
    select 1 from matches m
    where m.id = messages.match_id
      and (m.user_a = auth.uid() or m.user_b = auth.uid())
      and not is_blocked(m.user_a, m.user_b)
  )
);

create policy messages_send on messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from matches m
    where m.id = match_id
      and (m.user_a = auth.uid() or m.user_b = auth.uid())
      and not is_blocked(m.user_a, m.user_b)
  )
);

create or replace function create_match_on_reciprocal_like()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.decision = 'pass' then
    return new;
  end if;

  if is_blocked(new.actor_id, new.target_id) then
    return new;
  end if;

  if exists (
    select 1 from swipes s
    where s.actor_id = new.target_id
      and s.target_id = new.actor_id
      and s.decision <> 'pass'
  ) then
    insert into matches (user_a, user_b)
    values (least(new.actor_id, new.target_id), greatest(new.actor_id, new.target_id))
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger swipes_create_match
  after insert on swipes
  for each row execute function create_match_on_reciprocal_like();

create or replace function discover_feed(max_distance_m int default 50000, lim int default 30)
returns setof profiles
language sql stable
as $$
  with me as (select geo from profiles where id = auth.uid())
  select p.*
  from profiles p
  cross join me
  left join swipes inbound
    on inbound.actor_id = p.id
   and inbound.target_id = auth.uid()
   and inbound.decision <> 'pass'
  left join entitlements e
    on e.user_id = p.id
   and e.tier = 'premium'
   and (e.expires_at is null or e.expires_at > now())
  where p.id <> auth.uid()
    and p.deleted_at is null
    and p.is_discoverable
    and not exists (
      select 1 from swipes s where s.actor_id = auth.uid() and s.target_id = p.id
    )
    and not is_blocked(auth.uid(), p.id)
    and st_dwithin(p.geo, me.geo, max_distance_m)
  order by
    -- Priority likes: someone who has already liked you comes first, and a
    -- Premium liker comes first among those. This is what Premium buys on
    -- the *other* person's screen, which is the half most apps leave vague.
    case
      when inbound.id is not null and e.user_id is not null then 0
      when inbound.id is not null then 1
      else 2
    end,
    p.geo <-> me.geo,
    p.last_active_at desc
  limit lim;
$$;

create or replace function enforce_swipe_limit()
returns trigger
language plpgsql
as $$
declare
  used int;
  cap  int;
begin
  -- Passes are never capped. Without this the trigger fires on every swipe,
  -- so once the daily likes are gone you cannot pass either and the deck
  -- traps you on a card you do not want.
  if new.decision = 'pass' then
    return new;
  end if;

  select case when e.tier = 'premium' and (e.expires_at is null or e.expires_at > now())
              then 2147483647 else 6 end
    into cap
    from entitlements e where e.user_id = new.actor_id;

  -- No entitlements row means free. Defaulting the other way would hand out
  -- unlimited likes to anyone whose row failed to create.
  cap := coalesce(cap, 6);

  select count(*) into used
  from swipes
  where actor_id = new.actor_id
    and decision <> 'pass'
    and created_at >= date_trunc('day', now());

  if used >= cap then
    raise exception 'daily_like_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger swipes_rate_limit
  before insert on swipes
  for each row execute function enforce_swipe_limit();

-- ---------------------------------------------------------------------------
-- Row-level security on every remaining table.
--
-- This is not optional housekeeping. In Supabase a table with RLS disabled is
-- readable and writable by anyone holding the anon key, which ships inside the
-- app. A table without a policy below would be a public database.
-- ---------------------------------------------------------------------------

alter table profiles_private      enable row level security;
alter table profile_prompts       enable row level security;
alter table prompts               enable row level security;
alter table swipes                enable row level security;
alter table blocks                enable row level security;
alter table reports               enable row level security;
alter table verification_attempts enable row level security;
alter table entitlements          enable row level security;
alter table push_tokens           enable row level security;

-- Private fields: owner only, both directions.
create policy private_select on profiles_private for select using (id = auth.uid());
create policy private_update on profiles_private for update using (id = auth.uid())
  with check (id = auth.uid());
create policy private_insert on profiles_private for insert with check (id = auth.uid());

-- The prompt catalogue is public reference data, read-only to clients.
create policy prompts_read on prompts for select using (active);

-- Prompt answers are readable with the profile they belong to.
create policy profile_prompts_read on profile_prompts for select using (
  exists (
    select 1 from profiles p
    where p.id = profile_prompts.profile_id
      and p.deleted_at is null
      and (p.id = auth.uid() or not is_blocked(auth.uid(), p.id))
  )
);
create policy profile_prompts_write on profile_prompts for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Swipes: you may record your own and read your own. You may never read
-- anyone else's, which is what stops a client working out who liked them
-- without paying for it.
create policy swipes_insert on swipes for insert with check (
  actor_id = auth.uid() and not is_blocked(auth.uid(), target_id)
);
create policy swipes_select on swipes for select using (actor_id = auth.uid());

-- Blocks: you manage your own list and cannot see who has blocked you.
create policy blocks_insert on blocks for insert with check (blocker_id = auth.uid());
create policy blocks_select on blocks for select using (blocker_id = auth.uid());
create policy blocks_delete on blocks for delete using (blocker_id = auth.uid());

-- Reports: file your own, never read them back. Moderation reads with the
-- service role, so a reporter cannot learn what happened to their report
-- and a reported person cannot discover who filed it.
create policy reports_insert on reports for insert with check (reporter_id = auth.uid());

-- Verification results and entitlements are readable by their owner and
-- writable by nobody: no insert or update policy exists, so only the service
-- role can grant a verified badge or a subscription.
create policy verification_read on verification_attempts for select using (user_id = auth.uid());
create policy entitlements_read on entitlements for select using (user_id = auth.uid());

-- Push tokens belong to their device owner.
create policy push_tokens_all on push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- New accounts
--
-- Creating the profile and the free entitlement in a trigger means there is
-- no window where someone is signed in without them — and no path where a
-- missing entitlements row could be read as "not free".
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into profiles (id, name, age)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'New member'), 18)
  on conflict (id) do nothing;

  insert into entitlements (user_id, tier)
  values (new.id, 'free')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime
--
-- Only messages. Realtime still applies RLS, so a blocked person receives
-- nothing — but publishing fewer tables is less to get wrong.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table messages;

-- ---------------------------------------------------------------------------
-- Prompt catalogue
-- ---------------------------------------------------------------------------

insert into prompts (question) values
  ('My simple pleasures'),
  ('The way to win me over is'),
  ('I geek out on'),
  ('My most controversial opinion'),
  ('A perfect Sunday looks like'),
  ('Dating me is like'),
  ('Two truths and a lie'),
  ('I am looking for'),
  ('My love language is'),
  ('Teach me something about')
on conflict (question) do nothing;


-- ---------------------------------------------------------------------------
-- Column privileges
--
-- RLS is row-level. `profiles_self_write` lets you update your own row, and
-- that includes every column on it — so without the revoke below a client
-- can award itself the verified badge with a one-line update. Tested, and it
-- did exactly that before this was added.
--
-- Column-level privileges are the only thing that stops it, because no
-- policy can express "this row, but not this column".
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on prompts to anon;

-- A column-level REVOKE does not reduce a table-level GRANT: Postgres keeps
-- the broader privilege and the revoke silently does nothing. The table
-- grant has to go first, then UPDATE is handed back column by column.
-- Verified by testing — the column-revoke version still let a client set
-- its own `verified` flag.
revoke update on profiles from authenticated;
grant update (
  name, age, job_title, location_label, bio, interests,
  emoji, photo_path, geo, is_discoverable, last_active_at, deleted_at
) on profiles to authenticated;

revoke update on entitlements from authenticated;
revoke insert, update, delete on verification_attempts from authenticated;
revoke update, delete on reports from authenticated;
revoke insert, update, delete on prompts from authenticated, anon;

commit;
