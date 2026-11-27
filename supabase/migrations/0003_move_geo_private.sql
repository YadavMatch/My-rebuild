-- ---------------------------------------------------------------------------
-- Move geo out of profiles instead of hiding it with column privileges.
--
-- 0002 closed the leak by revoking SELECT on profiles and re-granting every
-- column except geo. That works, but `select *` then fails with
--
--   42501 permission denied for table profiles
--
-- because * still resolves to the ungranted column. PostgREST's .select()
-- with no arguments is exactly that, so an ordinary "update my name and give
-- me the row back" broke. Every query against profiles, forever, would have
-- had to enumerate its columns and remember why.
--
-- A column that must never be read by other clients does not belong on a
-- table those clients read. profiles_private already exists for precisely
-- this, so geo moves there and profiles goes back to being plainly readable.
-- ---------------------------------------------------------------------------

begin;

alter table profiles_private add column if not exists geo geography(point, 4326);

-- Carry over anything already set. profiles_private rows may not exist yet,
-- so insert where missing and update where present.
insert into profiles_private (id, date_of_birth, age_confirmed_at, geo)
select p.id, date '1900-01-01', now(), p.geo
from profiles p
where p.geo is not null
  and not exists (select 1 from profiles_private pp where pp.id = p.id)
on conflict (id) do nothing;

update profiles_private pp
set geo = p.geo
from profiles p
where p.id = pp.id and p.geo is not null;

drop index if exists profiles_geo_idx;
alter table profiles drop column geo;
create index on profiles_private using gist (geo);

-- profiles holds nothing secret now, so the column list from 0002 is just a
-- liability. Back to a plain table grant.
grant select on profiles to authenticated;

-- geo is gone from the updatable column list for the same reason.
revoke update on profiles from authenticated;
grant update (
  name, age, job_title, location_label, bio, interests,
  emoji, photo_path, is_discoverable, last_active_at, deleted_at
) on profiles to authenticated;

-- Reads its own geo and everyone else's, so it stays security definer with
-- every filter RLS would have applied written out.
drop function if exists discover_feed(int, int);

create function discover_feed(max_distance_m int default 50000, lim int default 30)
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
  with me as (select geo from profiles_private where id = auth.uid())
  select
    p.id, p.name, p.age, p.job_title, p.location_label, p.bio, p.interests,
    p.emoji, p.photo_path, p.verified, p.last_active_at,
    case
      when me.geo is null or pp.geo is null then 'Distance unknown'
      when st_distance(pp.geo, me.geo) < 1500 then 'Nearby'
      else round(st_distance(pp.geo, me.geo) / 1000.0)::int || ' km away'
    end as proximity
  from profiles p
  left join profiles_private pp on pp.id = p.id
  cross join me
  left join swipes inbound
    on inbound.actor_id = p.id
   and inbound.target_id = auth.uid()
   and inbound.decision <> 'pass'
  left join entitlements e
    on e.user_id = p.id
   and e.tier = 'premium'
   and (e.expires_at is null or e.expires_at > now())
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.deleted_at is null
    and p.is_discoverable
    and not exists (
      select 1 from swipes s where s.actor_id = auth.uid() and s.target_id = p.id
    )
    and not is_blocked(auth.uid(), p.id)
    and (me.geo is null or pp.geo is null or st_dwithin(pp.geo, me.geo, max_distance_m))
  order by
    case
      when inbound.id is not null and e.user_id is not null then 0
      when inbound.id is not null then 1
      else 2
    end,
    case when me.geo is null or pp.geo is null then null else pp.geo <-> me.geo end
      nulls last,
    p.last_active_at desc
  limit lim;
$$;

revoke execute on function discover_feed(int, int) from public, anon;
grant execute on function discover_feed(int, int) to authenticated;

commit;
