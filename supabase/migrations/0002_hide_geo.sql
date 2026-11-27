-- ---------------------------------------------------------------------------
-- Stop handing out everyone's exact coordinates.
--
-- 0001 revoked table-wide UPDATE on profiles and handed it back column by
-- column, so a client could not set its own `verified` flag. It never did the
-- same for SELECT. `grant select ... on all tables` therefore included `geo`,
-- and any signed-in client — the anon key ships inside the app — could read
-- the precise location of every discoverable profile:
--
--   geo: 0101000020E6100000B7D100DE0269534014D044D8F0F42940
--     -> lon 77.640800, lat 12.978400
--
-- That is not a trilateration risk, which is what the column comment guards
-- against. It is the home address itself, in one query.
--
-- Two changes: geo becomes unreadable by clients, and discover_feed stops
-- returning whole profile rows, handing back a coarse label instead.
-- ---------------------------------------------------------------------------

begin;

-- Same reasoning as the UPDATE revoke in 0001: a column-level REVOKE does not
-- reduce a table-level GRANT, so the table grant goes first.
revoke select on profiles from authenticated;
grant select (
  id, name, age, job_title, location_label, bio, interests, emoji,
  photo_path, verified, verified_at, is_discoverable, last_active_at,
  deleted_at, created_at
) on profiles to authenticated;

-- `returns setof profiles` means every column, geo included, so the row type
-- has to be spelled out. The function reads geo internally to sort and to
-- bucket the distance, which needs security definer now that callers cannot
-- read the column — so every filter RLS would have applied is repeated here.
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
  with me as (select geo from profiles where id = auth.uid())
  select
    p.id, p.name, p.age, p.job_title, p.location_label, p.bio, p.interests,
    p.emoji, p.photo_path, p.verified, p.last_active_at,
    case
      -- Nobody has captured a location yet. Saying "Nearby" here would be a
      -- guess presented as a fact.
      when me.geo is null or p.geo is null then 'Distance unknown'
      when st_distance(p.geo, me.geo) < 1500 then 'Nearby'
      -- Rounded to the kilometre. Enough to be useful, coarse enough that
      -- repeated reads do not narrow down an address.
      else round(st_distance(p.geo, me.geo) / 1000.0)::int || ' km away'
    end as proximity
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
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.deleted_at is null
    and p.is_discoverable
    and not exists (
      select 1 from swipes s where s.actor_id = auth.uid() and s.target_id = p.id
    )
    and not is_blocked(auth.uid(), p.id)
    -- Without a location on either side the distance filter cannot apply.
    -- Dropping the row instead would leave the deck empty until location
    -- capture exists, which is worse than showing an honest label.
    and (me.geo is null or p.geo is null or st_dwithin(p.geo, me.geo, max_distance_m))
  order by
    case
      when inbound.id is not null and e.user_id is not null then 0
      when inbound.id is not null then 1
      else 2
    end,
    case when me.geo is null or p.geo is null then null else p.geo <-> me.geo end
      nulls last,
    p.last_active_at desc
  limit lim;
$$;

-- security definer means the grant matters: only signed-in callers.
revoke execute on function discover_feed(int, int) from public, anon;
grant execute on function discover_feed(int, int) to authenticated;

commit;
