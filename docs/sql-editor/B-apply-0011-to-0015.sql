-- ===========================================================================
-- B of 4: MIGRATIONS 0011 TO 0015
--
-- Copied verbatim from the repository, not retyped. Each is wrapped in its own
-- transaction and each says it is safe to run twice, so a second paste is a
-- no-op rather than an error.
--
--   0011  proximity discovery: six radii, mutual eligibility, coarse locations
--   0012  the photo bucket policy, which let anyone read any photo
--   0013  advisory lock on the daily like cap
--   0014  message rate limits
--   0015  the moderation queue
--
-- ONE IRREVERSIBLE STEP IN HERE. 0011 rounds every stored location to two
-- decimal places and the discarded precision does not come back. File A told
-- you how many rows that is. It is the privacy fix working as intended.
--
-- 0011 needs PostGIS, which 0001 already installed on this project.
-- ===========================================================================

-- ========================= 0011_proximity_discovery.sql =========================
-- ---------------------------------------------------------------------------
-- Proximity discovery: a radius each member chooses, applied both ways.
--
-- Three things change.
--
-- 1. THE RADIUS BECOMES A SAVED PREFERENCE.
--
-- It was never one. `discover_feed` took `max_distance_m` as an argument and
-- the client passed a hard-coded 50000 on every call, so the limit lived in
-- one line of TypeScript and any caller could pass anything. A caller-supplied
-- radius is also a locating oracle: vary it, see who appears or disappears,
-- and you binary-search someone's distance to whatever precision you like. The
-- argument is gone. The radius now lives on the member's own row and the
-- function reads it; nothing a caller sends can change the circle.
--
-- Legacy values. There are none to migrate, and that is worth stating plainly
-- rather than inventing a mapping: no radius was ever persisted for anybody.
-- The 50 km in the client was a request-time constant, not a member's choice,
-- which makes it exactly the "ambiguous old value" the brief describes. So
-- rows that already exist get NULL, meaning "not chosen", and the member is
-- asked to pick before proximity discovery runs for them. New rows default to
-- 10 km. Adding the column without a default and setting the default
-- afterwards is what keeps those two cases apart: Postgres backfills existing
-- rows when a default is supplied in ADD COLUMN, and that would have silently
-- handed everyone 10 km instead of asking.
--
-- Nobody's range widens either way.
--
-- 2. STORED LOCATIONS BECOME COARSE.
--
-- `saveLocation` wrote the device's exact coordinates. Rounding to two decimal
-- places puts every member on a grid of about 1.1 km in latitude and, at
-- Indian latitudes, 1.0 to 1.1 km in longitude — so a stored point is up to
-- roughly 800 m from where the person actually is. Against a 10 km radius that
-- is noise; against an attempt to find someone's street it is the difference
-- between a building and a neighbourhood. This is why the brief calls the
-- radius approximate: a pair either side of a cutoff can fall in or out by
-- about a kilometre, and that is the intended trade.
--
-- The trigger means the exact value never lands in the column, including from
-- a client that writes the row directly. Existing rows are coarsened in place,
-- which is deliberate and cannot be undone: the precision being discarded is
-- precision we should not be holding.
--
-- 3. ELIGIBILITY IS MUTUAL.
--
-- A pair is eligible only when their separation fits BOTH radii, which is the
-- same as fitting the smaller of the two: `least(mine, theirs)`. Two members
-- 90 km apart see each other only if both chose 100 km or more. One of them
-- choosing 150 km does nothing on its own. Choosing a wide radius is a
-- statement about who you want to see, not about who may see you.
--
-- What the client is told: a label, and nothing else. No coordinates, no grid
-- cell, no metres, no band number, no rank. "Nearby" for the closest band, and
-- otherwise the city label the candidate chose to publish on their own
-- profile. Ranking uses bands wide enough that a position in the list does not
-- reveal a distance.
--
-- Borders do not appear anywhere in this file, which is the point. The filter
-- is a geodesic radius on a geography column, so Delhi to Haryana to
-- Chandigarh is just a distance in metres, and a city label is something a
-- member types rather than something that decides eligibility.
--
-- Safe to run twice.
--
-- requires-postgis: run.sh skips this file. That harness replaces geography
-- with text and st_dwithin with `true`, which would turn every assertion
-- here into a tautology. supabase/tests/run_proximity.sh applies it against
-- real PostGIS instead, and supabase/tests/proximity_test.sql is where the
-- distance behaviour is actually tested.
-- ---------------------------------------------------------------------------

begin;

-- --------------------------------------------------------------- the radius

alter table profiles_private
  add column if not exists discovery_radius_m integer;

-- New rows only. Existing rows keep NULL so they are asked to choose; see the
-- note above on why the default is set in a second statement.
alter table profiles_private
  alter column discovery_radius_m set default 10000;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_private_discovery_radius_supported'
  ) then
    alter table profiles_private
      add constraint profiles_private_discovery_radius_supported
      check (
        discovery_radius_m is null
        or discovery_radius_m in (10000, 25000, 50000, 75000, 100000, 150000)
      );
  end if;
end;
$$;

comment on column profiles_private.discovery_radius_m is
  'How far this member chose to look, in metres: one of 10/25/50/75/100/150 km. '
  'NULL means not chosen yet, and proximity discovery stays off until it is. '
  'Applied in both directions: a pair needs least(mine, theirs) to cover them.';

-- ------------------------------------------------------- coarse coordinates

create or replace function coarsen_discovery_location()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.geo is null then
    return new;
  end if;

  -- Two decimal places: ~1.1 km of latitude, ~1.0-1.1 km of longitude in
  -- India. Rounding both ways means the grid is stable, so a member who does
  -- not move does not drift in and out of someone's radius between saves.
  new.geo := extensions.st_setsrid(
    extensions.st_makepoint(
      round(extensions.st_x(new.geo::extensions.geometry)::numeric, 2)::float8,
      round(extensions.st_y(new.geo::extensions.geometry)::numeric, 2)::float8
    ),
    4326
  )::extensions.geography;

  return new;
end;
$$;

drop trigger if exists profiles_private_coarsen_geo on profiles_private;

create trigger profiles_private_coarsen_geo
  before insert or update of geo on profiles_private
  for each row execute function coarsen_discovery_location();

-- Existing rows. Re-saving each one through the trigger discards the precision
-- we should not have been keeping.
update profiles_private set geo = geo where geo is not null;

-- ------------------------------------------------- what the member can learn

-- The client needs to know whether to prompt for a location, prompt for a
-- radius, or show the deck. It does not need coordinates to answer that, so
-- this returns two facts and no geometry.
create or replace function discovery_status()
returns table (has_location boolean, radius_m integer)
language sql stable security definer
set search_path = public
as $$
  select
    exists (
      select 1 from profiles_private pr
      where pr.id = auth.uid() and pr.geo is not null
    ),
    (select pr.discovery_radius_m from profiles_private pr where pr.id = auth.uid());
$$;

revoke execute on function discovery_status() from public, anon;
grant  execute on function discovery_status() to authenticated;

-- -------------------------------------------------------------- the feed

-- The signature changes, so it is dropped rather than replaced: the radius
-- argument is the thing being removed.
drop function if exists discover_feed(int, int);

create function discover_feed(lim int default 30, page_offset int default 0)
returns table (
  id              uuid,
  name            text,
  age             int,
  job_title       text,
  location_label  text,
  bio             text,
  interests       text[],
  emoji           text,
  photo_path      text,
  verified        boolean,
  last_active_at  timestamptz,
  proximity       text
)
language sql stable security definer
set search_path = public, extensions
as $$
  with me as (
    select pr.geo, pr.discovery_radius_m as radius_m
    from profiles_private pr
    where pr.id = auth.uid()
  ),
  eligible as (
    select
      p.id, p.name, p.age, p.job_title, p.location_label, p.bio, p.interests,
      p.emoji, p.photo_path, p.verified, p.last_active_at,
      -- Bands, not distances. Wide enough that a place in the list does not
      -- give away a separation, ordered so the closest band comes first.
      case
        when extensions.st_distance(pp.geo, me.geo) <  5000 then 0
        when extensions.st_distance(pp.geo, me.geo) < 15000 then 1
        when extensions.st_distance(pp.geo, me.geo) < 35000 then 2
        when extensions.st_distance(pp.geo, me.geo) < 75000 then 3
        else 4
      end as band
    from profiles p
    join profiles_private pp on pp.id = p.id
    cross join me
    where auth.uid() is not null
      -- Both members must have something to compare and a radius they chose.
      and me.geo is not null
      and me.radius_m is not null
      and pp.geo is not null
      and pp.discovery_radius_m is not null
      -- Mutual: the separation has to fit inside both circles.
      and extensions.st_dwithin(
            pp.geo, me.geo, least(me.radius_m, pp.discovery_radius_m)
          )
      -- Everything that decided eligibility before still decides it.
      and p.id <> auth.uid()
      and p.deleted_at is null
      and p.is_discoverable
      and not exists (
        select 1 from swipes s where s.actor_id = auth.uid() and s.target_id = p.id
      )
      and not is_blocked(auth.uid(), p.id)
  )
  select
    e.id, e.name, e.age, e.job_title, e.location_label, e.bio, e.interests,
    e.emoji, e.photo_path, e.verified, e.last_active_at,
    case
      when e.band = 0 then 'Nearby'
      else coalesce(nullif(btrim(e.location_label), ''), 'Further away')
    end::text as proximity
  from eligible e
  -- Filtered and ranked before the window is taken. The last two keys make the
  -- order total, so paging does not reshuffle rows between requests.
  order by e.band, e.last_active_at desc, e.id
  offset greatest(coalesce(page_offset, 0), 0)
  limit  least(greatest(coalesce(lim, 30), 1), 50);
$$;

revoke execute on function discover_feed(int, int) from public, anon;
grant  execute on function discover_feed(int, int) to authenticated;

commit;


-- ========================= 0012_photo_access.sql =========================
-- ---------------------------------------------------------------------------
-- Who may read a profile photo.
--
-- 0005 created the bucket private and then granted this:
--
--   create policy profile_photos_read on storage.objects
--     for select to authenticated
--     using (bucket_id = 'profile-photos');
--
-- Which is every object in the bucket, to every signed-in account. The bucket
-- not being public bought nothing, because the policy handed it back. Paths
-- are `<uid>/avatar.jpg`, so they are not even guesswork: any profile id —
-- and ids travel in the feed — gives you the path to that person's photo.
--
-- That covers people who hid, deleted their account, or blocked the person
-- asking. A photo should stop being readable when any of those happen, and it
-- did not.
--
-- Three ways in now, and nothing else:
--
--   1. It is yours. The folder is named after the uploader, so this is a
--      string comparison and holds even for a profile that is hidden or
--      deleted — you can still see your own picture.
--
--   2. The profile is discoverable, not deleted, and has not blocked you.
--      This is the feed case, and it tracks the feed: hide yourself and your
--      photo goes with you.
--
--   3. You are matched. Without this, hiding yourself would blank your photo
--      inside conversations you are already having — the remediation review
--      raised that as a question and it is a defect, not a question. A match
--      is a relationship the other person opted into, so it outlives their
--      appearing in the deck. Blocks still override it.
--
-- `photo_path` has to equal the object name for cases 2 and 3, so a stale or
-- renamed object is not readable through a profile that no longer points at
-- it. Verified against the uploader: `uploadProfilePhoto` writes
-- `<uid>/avatar.<ext>` as both the storage path and `profiles.photo_path`.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

begin;

drop policy if exists profile_photos_read on storage.objects;

create policy profile_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      -- 1. Your own folder.
      (storage.foldername(name))[1] = (select auth.uid())::text

      -- 2. A profile you could meet.
      or exists (
        select 1
        from profiles p
        where p.id::text = (storage.foldername(objects.name))[1]
          and p.photo_path = objects.name
          and p.deleted_at is null
          and p.is_discoverable
          and not is_blocked((select auth.uid()), p.id)
      )

      -- 3. Someone you matched with, whether or not they are still in the
      --    deck. Blocks are checked here too: blocking is meant to work after
      --    a match, which is when it matters most.
      or exists (
        select 1
        from profiles p
        join matches m
          on (m.user_a = p.id and m.user_b = (select auth.uid()))
          or (m.user_b = p.id and m.user_a = (select auth.uid()))
        where p.id::text = (storage.foldername(objects.name))[1]
          and p.photo_path = objects.name
          and p.deleted_at is null
          and not is_blocked((select auth.uid()), p.id)
      )
    )
  );

commit;


-- ========================= 0013_swipe_lock.sql =========================
-- ---------------------------------------------------------------------------
-- The daily like cap, made safe against two requests at once.
--
-- `enforce_swipe_limit` counts today's likes and then compares the count to
-- the cap. Two inserts arriving together both read 5, both decide 5 < 6, and
-- both proceed: the cap is 6 and the member gets 7. Under READ COMMITTED
-- neither transaction sees the other's uncommitted row, so nothing stops it.
--
-- Not hypothetical — a double-tap, a retry after a slow response, or two
-- devices are enough. The window is small, which is why it would have shown
-- up as an occasional unexplained 7th like rather than as a bug report.
--
-- An advisory lock keyed on the actor serialises the count-then-check for one
-- member and nobody else. `pg_advisory_xact_lock` releases at the end of the
-- transaction, including on rollback, so a failed insert cannot leave a lock
-- behind. Keying on the actor rather than the table means two different
-- members never wait for each other.
--
-- This idea came from the remediation review, which had it right. The rest of
-- that function is unchanged.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

begin;

create or replace function enforce_swipe_limit()
returns trigger
language plpgsql
set search_path = public, pg_catalog
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

  -- Everything below this line is one member's count-then-check, and has to
  -- happen alone. Taken before the count, so a concurrent insert waits here
  -- rather than reading a stale number.
  perform pg_advisory_xact_lock(hashtextextended('nearmatch:swipe:' || new.actor_id::text, 0));

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

commit;


-- ========================= 0014_message_rate_limit.sql =========================
-- ---------------------------------------------------------------------------
-- A server-side limit on sending messages.
--
-- The product spec lists "swipe and message rate limits" and only half of it
-- existed: likes are capped by a trigger, messages by nothing at all. A client
-- could send as fast as it could loop, and nothing in the database would
-- object. On a dating app that is the mechanism for harassment at volume, and
-- the kind of thing that is only ever noticed after it happens to someone.
--
-- Two limits, because they catch different behaviour:
--
--   * 20 messages a minute, all matches together. A human typing cannot reach
--     this; a loop reaches it immediately. This is the abuse limit.
--
--   * 60 messages an hour to ONE match. Deliberately generous — a lively
--     conversation runs well under it — but it caps a single person being
--     buried, which the per-minute limit alone does not: 19 a minute, forever,
--     would never trip it.
--
-- Both raise `message_rate_limit_reached`, and the client already knows how to
-- surface a named database error from the like cap.
--
-- Same advisory lock reasoning as 0013: count-then-check is not atomic under
-- READ COMMITTED, so two sends arriving together could both pass the check.
-- Keyed on the sender, so two members never wait for each other.
--
-- Not capped here: message length, which 0001 already constrains to 2000
-- characters, and who may send at all, which the `messages_send` policy
-- decides. This only limits rate.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

begin;

create or replace function enforce_message_rate_limit()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  per_minute      int;
  per_hour_to_one int;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('nearmatch:message:' || new.sender_id::text, 0)
  );

  select count(*) into per_minute
  from messages
  where sender_id = new.sender_id
    and created_at >= now() - interval '1 minute';

  if per_minute >= 20 then
    raise exception 'message_rate_limit_reached' using errcode = 'P0001';
  end if;

  select count(*) into per_hour_to_one
  from messages
  where sender_id = new.sender_id
    and match_id = new.match_id
    and created_at >= now() - interval '1 hour';

  if per_hour_to_one >= 60 then
    raise exception 'message_rate_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_rate_limit on messages;

create trigger messages_rate_limit
  before insert on messages
  for each row execute function enforce_message_rate_limit();

commit;


-- ========================= 0015_moderation_queue.sql =========================
-- ---------------------------------------------------------------------------
-- Making a report reachable.
--
-- `reports` has had `status`, `reviewed_by` and `reviewed_at` since 0001, and
-- nothing has ever read or written them. 0001 revoked update and delete from
-- `authenticated`, correctly — a reporter must not be able to close their own
-- report, and the reported person must not be able to close it either — which
-- left `service_role` as the only writer and no function for it to call. So
-- reports accumulated in a table nobody queried. The product spec has said
-- "moderation queue to receive it" against both report features all along.
--
-- Three functions, all reachable only by `service_role`, which lives on a
-- server and never in the app:
--
--   moderation_queue(lim)      what is waiting, oldest first
--   claim_report(id, who)      mark it as being looked at
--   resolve_report(id, ...)    record the decision
--
-- Oldest first on purpose. A queue that shows the newest first quietly
-- abandons the reports nobody got to, which for safety reports is the worst
-- failure mode available.
--
-- `claim_report` only moves a report out of `open`, so two moderators opening
-- the queue together cannot both claim one: the second gets no row back and
-- knows to move on. `resolve_report` accepts only `actioned` or `dismissed`,
-- so the enum cannot be walked backwards into `open` and reopened silently.
--
-- WHAT THIS DOES NOT DO, stated plainly because the spec's claim depends on
-- it: nothing here is a human. It makes the queue queryable and actionable by
-- something holding the service key. There is no moderator UI, no assignment,
-- no SLA, no notification when a report arrives, and resolving a report as
-- `actioned` records a decision without hiding anyone or suspending anything
-- — what an action should do to an account is a policy question, not a schema
-- one. Until a person is actually working this queue, "real moderation" is
-- still not a true claim about the app.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

begin;

-- The queue is read by status and ordered by age, so index exactly that.
-- Partial, because `actioned` and `dismissed` rows are history and the queue
-- never asks for them.
create index if not exists reports_open_queue_idx
  on reports (created_at)
  where status in ('open', 'reviewing');

-- ------------------------------------------------------------------ reading

create or replace function moderation_queue(lim int default 50)
returns table (
  id            uuid,
  status        report_status,
  context       report_context,
  reason        text,
  created_at    timestamptz,
  reporter_id   uuid,
  reported_id   uuid,
  match_id      uuid,
  message_id    uuid,
  reviewed_by   uuid,
  -- Enough to judge without opening another query: has this person been
  -- reported before, and are they still visible to members?
  reported_times        bigint,
  reported_is_visible   boolean
)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select
    r.id, r.status, r.context, r.reason, r.created_at,
    r.reporter_id, r.reported_id, r.match_id, r.message_id, r.reviewed_by,
    (select count(*) from reports prior where prior.reported_id = r.reported_id),
    coalesce((
      select p.deleted_at is null and p.is_discoverable
      from profiles p where p.id = r.reported_id
    ), false)
  from reports r
  where r.status in ('open', 'reviewing')
  order by r.created_at
  limit least(greatest(coalesce(lim, 50), 1), 200);
$$;

-- ------------------------------------------------------------------ writing

-- Returns the row it claimed, or nothing if somebody else got there first.
create or replace function claim_report(target uuid, moderator uuid)
returns table (id uuid, status report_status)
language sql volatile security definer
set search_path = public, pg_catalog
as $$
  update reports
     set status = 'reviewing', reviewed_by = moderator
   where reports.id = target
     and reports.status = 'open'
  returning reports.id, reports.status;
$$;

create or replace function resolve_report(
  target    uuid,
  outcome   report_status,
  moderator uuid default null
)
returns table (id uuid, status report_status)
language plpgsql volatile security definer
set search_path = public, pg_catalog
as $$
begin
  if outcome not in ('actioned', 'dismissed') then
    raise exception 'resolve_report_invalid_outcome' using errcode = 'P0001';
  end if;

  return query
    update reports
       set status = outcome,
           reviewed_at = now(),
           reviewed_by = coalesce(moderator, reports.reviewed_by)
     where reports.id = target
       and reports.status in ('open', 'reviewing')
    returning reports.id, reports.status;
end;
$$;

-- Only a server may work the queue. Supabase grants execute on public
-- functions to anon and authenticated as they are created, so these have to
-- be taken back explicitly rather than merely not granted.
revoke execute on function moderation_queue(int)                    from public, anon, authenticated;
revoke execute on function claim_report(uuid, uuid)                 from public, anon, authenticated;
revoke execute on function resolve_report(uuid, report_status, uuid) from public, anon, authenticated;

grant execute on function moderation_queue(int)                     to service_role;
grant execute on function claim_report(uuid, uuid)                  to service_role;
grant execute on function resolve_report(uuid, report_status, uuid)  to service_role;

commit;


