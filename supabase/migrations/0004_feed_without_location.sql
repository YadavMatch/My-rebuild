-- ---------------------------------------------------------------------------
-- Make the feed work before anyone has a location row.
--
-- discover_feed built the caller's position with
--
--   with me as (select geo from profiles_private where id = auth.uid())
--   ...
--   cross join me
--
-- A brand-new account has no profiles_private row at all, so `me` is empty
-- and the cross join produces nothing. Every new user saw "That is everyone
-- for now" on an app with profiles in it. Measured:
--
--   WITHOUT a profiles_private row ->  0 rows
--   WITH a row but geo null        -> 30 rows
--
-- The null-location handling added in 0002 only ever covered the second case.
-- A scalar subquery always yields exactly one row — null when there is no
-- row and null when there is one with no geo — so both behave the same.
-- ---------------------------------------------------------------------------

begin;

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
  -- Always one row, whether or not the caller has a location.
  with me as (select (select pr.geo from profiles_private pr where pr.id = auth.uid()) as geo)
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
