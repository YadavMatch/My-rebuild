# NearMatch — data model

A concrete schema for the spec in [`product-spec.md`](product-spec.md). Written
as Postgres, which covers Supabase, Nhost and a self-hosted API. Notes at the
end cover what changes on Firestore.

Nothing here has been created yet. The point is to see what the backend
choice commits you to **before** opening an account.

---

## The five decisions that shape everything

**1. Blocking is one function, referenced everywhere.**
"A blocked person can't reconnect through any path" is only true if every
read goes through the same check. One SQL function, called from every policy,
makes that structurally true rather than something to remember.

**2. Matches are created by the database, not the client.**
A client that decides "this is a match" can be made to lie. A trigger on the
swipe insert is the only writer.

**3. Date of birth lives in a separate table.**
Row-level security is row-level — it cannot hide one column from a row the
caller may read. Private fields go in their own table that only the owner can
read, so DOB and phone cannot leak through a profile query.

**4. `verified` and `premium` are never client-writable.**
Both are claims about money and identity. Having no update policy is enough
for `entitlements`, but **not** for `verified`, which sits on `profiles`
alongside columns the owner must be able to edit. RLS is row-level: a policy
that lets you update your own row lets you update every column of it.
Column-level `revoke update (verified, ...)` is the only thing that closes
that, and testing confirmed a client could hand itself the badge without it.

**5. The selfie check records a result, never a photo.**
The copy promises the photo is not stored. The schema has nowhere to put one,
which is a stronger guarantee than a policy saying we delete it.

---

## Tables

```sql
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
```

---

## Blocking, in one place

```sql
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
```

Symmetric on purpose: blocking hides you from them as well as them from you,
so a block cannot be used to work out that you blocked someone.

Every policy calls it:

```sql
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
```

Note what this buys: blocking someone makes an existing conversation
unreadable to both sides immediately, without deleting anything or running a
cleanup job.

`tier` is not writable by these policies at all — `entitlements` has no
update policy, so only service-role code can set it.

`verified` needs more than that. It lives on `profiles`, which the owner must
be able to update, and a row-level policy cannot exclude one column. The
migration revokes the column privilege explicitly:

```sql
revoke update (verified, verified_at, created_at) on profiles from authenticated;
```

Without that line a client can award itself a verified badge with a single
update. That is not hypothetical — the first run of the test suite did it.

---

## Matches are made by the database

```sql
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
```

`on conflict do nothing` plus the canonical ordering means simultaneous likes
produce exactly one match.

---

## The feed

```sql
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
```

Filtering happens in the database. The full user table never reaches a device.

Distance sorts the feed but is never returned — the client gets the coarse
`location_label` only. A precise distance that updates as people move lets
someone trilaterate a home address.

The ordering leaks nothing: the card looks identical whether that person
liked you or not, so being shown early does not tell you who is interested.
Only the position changes, and position alone is not readable.

---

## Rate limits

```sql
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
```

Six likes a day on the free tier, unlimited on Premium.

This is also the Premium gate: the free cap is the thing a subscription
lifts, so the limit and the paywall are one mechanism rather than two.

Six is deliberately tight, and it is the same shape as Hinge's model rather
than Tinder's — it fits an app whose pitch is real intentions rather than
volume. The number lives in one place here, so changing it later is a single
edit and does not need a release.

Message flooding wants a similar check, plus a short per-minute window.

---

## Account deletion

One decision you need to make, because the law and the product pull apart.

`profiles.deleted_at` soft-deletes immediately: the person disappears from
every feed, match and conversation. A purge job then removes the row for real.

The open question is **messages the other person received**. Options:

1. Delete them. Cleanest for the person leaving; the other person's
   conversation develops holes.
2. Keep the text, detach the sender. The conversation stays readable, but
   their words remain on someone else's device.

Most apps choose 2 and say so in the privacy policy. Worth getting a view on
this from someone who knows DPDP obligations before you build it.

---

## This schema was executed, not just written

Every SQL block above was run against PostgreSQL 16 and the behaviour
checked. PostGIS is not installed in that environment, so `geography` and
`st_dwithin` were stubbed for the run; everything else — constraints, enums,
the match trigger, the rate limit, and the RLS policies under a non-superuser
role — is exactly as written here.

| Behaviour | Result |
| --- | --- |
| A one-way like creates no match | 0 matches |
| The reciprocal like creates exactly one | 1 match |
| `user_a < user_b` holds on every match | true |
| The same person cannot be swiped twice | unique violation raised |
| A like from someone who blocked you creates no match | still 1 match |
| Messages are readable inside a match | visible |
| Blocking hides the conversation from **both** sides at once | 0 and 0 |
| A blocked person cannot see the other profile | 0 rows |
| A blocked person cannot send into the match | insert matched no visible row |
| The 7th like in a day is refused | `daily_like_limit_reached` |
| A pass at the cap still succeeds | inserted |
| Premium lifts the cap | the next like succeeds |
| `discover_feed` runs with the priority-likes ordering | returns rows |

Running it caught a bug worth keeping in mind: the first version of the
rate-limit trigger fired on every swipe, so once the daily likes were gone a
free account could not **pass** either — the deck would trap you on a card
you did not want. Reading the function, it looks right; the counter only
counts likes. The fault is that it raises before checking what the new row
is. That is the kind of thing only execution finds.

The blocking result is the one worth dwelling on. A single `is_blocked`
function, referenced by each policy, made an existing conversation
unreadable to both people the instant a block row appeared — no cleanup job,
no cascade, nothing to remember at the call site. That is the property the
store copy is promising, and it is the strongest argument for Postgres here.

---

## How this maps to the app today

`src/services/index.ts` is the only file that changes. The screens do not.

| Service function | Becomes |
| --- | --- |
| `fetchDeck` | `select * from discover_feed()` |
| `registerLike` / `registerPass` | `insert into swipes`; the trigger makes the match |
| `fetchConversations` | `select from matches` + latest message |
| `sendMessage` | `insert into messages` |
| `submitReport` | `insert into reports` |
| `block` | `insert into blocks` |
| `fetchCurrentUser` | `select from profiles where id = auth.uid()` |

---

## If you choose Firestore instead

Most of this is still doable; three things get harder.

- **Blocking** becomes a rule repeated across every collection, and rules
  cannot do a join. The usual workaround is denormalising a `blockedBy` array
  onto each document and keeping it in sync with a function — correct only
  as long as that function never fails.
- **Proximity** needs geohash prefixes and client-side distance filtering,
  which means over-fetching candidates. No `st_dwithin`.
- **Match creation** moves to a Cloud Function; the uniqueness guarantee the
  `check (user_a < user_b)` constraint gives for free becomes a transaction
  you write yourself.

What Firestore gives back: phone OTP that works in India without DLT
registration, push notifications in the same SDK, and realtime with no extra
setup.
