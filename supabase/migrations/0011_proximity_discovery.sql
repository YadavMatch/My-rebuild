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
