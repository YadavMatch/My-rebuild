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
