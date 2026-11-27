-- ===========================================================================
-- NearMatch — SQL Editor, A of 4: PREFLIGHT FOR 0011 TO 0016
--
-- READ-ONLY. Nothing here changes anything.
--
-- Run this first and KEEP THE OUTPUT. Two of the migrations that follow
-- change data irreversibly, and the second half of this file tells you how
-- much, before you decide.
--
-- Written as ONE statement on purpose. The Supabase SQL Editor shows the
-- result of the last statement only, so a file split into several SELECTs
-- would quietly hide everything but the final block. Everything below lands
-- in a single grid, ordered by section.
-- ===========================================================================

select section, item, value
  from (

    -- ---------------------------------------------- 1. what is already there
    select 1 as sort, '1. already applied?' as section,
           '0011 proximity: discovery_radius_m column' as item,
           case when exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles_private'
               and column_name = 'discovery_radius_m')
           then 'applied' else 'NOT applied' end as value

    union all select 1, '1. already applied?',
      '0011 proximity: coarsening trigger',
      case when exists (select 1 from pg_trigger
        where tgrelid = 'public.profiles_private'::regclass
          and tgname = 'profiles_private_coarsen_geo' and not tgisinternal)
      then 'applied' else 'NOT applied' end

    union all select 1, '1. already applied?',
      '0011 proximity: discover_feed has no radius argument',
      case when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'discover_feed'
          and not ('max_distance_m' = any (p.proargnames)))
      then 'applied' else 'NOT applied' end

    union all select 1, '1. already applied?',
      '0012 photo access: the policy was rewritten',
      case when exists (select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'profile_photos_read' and qual like '%matches%')
      then 'applied' else 'NOT applied' end

    union all select 1, '1. already applied?',
      '0013 like cap: advisory lock in enforce_swipe_limit',
      case when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'enforce_swipe_limit'
          and pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock%')
      then 'applied' else 'NOT applied' end

    union all select 1, '1. already applied?',
      '0014 message rate limit: trigger on messages',
      case when exists (select 1 from pg_trigger
        where tgrelid = 'public.messages'::regclass
          and tgname = 'messages_rate_limit' and not tgisinternal)
      then 'applied' else 'NOT applied' end

    union all select 1, '1. already applied?',
      '0015 moderation queue: moderation_queue()',
      case when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'moderation_queue')
      then 'applied' else 'NOT applied' end

    union all select 1, '1. already applied?',
      '0016 declared age: date_of_birth is nullable',
      case when exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles_private'
          and column_name = 'date_of_birth' and is_nullable = 'YES')
      then 'applied' else 'NOT applied' end

    -- ------------------------------------- 2. what cannot be undone, in rows
    --
    -- 0011 rounds every stored location to two decimal places, about a
    -- kilometre. The precision it discards cannot be recovered. That is the
    -- privacy fix, but it is one-way, so this is how many rows it touches.
    union all select 2, '2. irreversible — read these numbers',
      '0011 rounds this many stored locations to the ~1 km grid (one-way, first run only)',
      (select count(*)::text from profiles_private where geo is not null)

    -- 0016 nulls the fabricated 1900-01-01 dates. 0003 wrote one for every
    -- row it carried over, so this number may be large.
    union all select 2, '2. irreversible — read these numbers',
      '0016 will null this many fabricated dates of birth',
      (select count(*)::text from profiles_private
        where date_of_birth = date '1900-01-01')

    -- The one that changes what members see: these profiles are in the deck
    -- today on a date of birth nobody supplied, and 0016 takes them out.
    union all select 2, '2. irreversible — read these numbers',
      '0016 will HIDE this many profiles now in the deck',
      (select count(*)::text from profiles p
         join profiles_private pr on pr.id = p.id
        where p.is_discoverable and p.deleted_at is null
          and pr.date_of_birth = date '1900-01-01')

    union all select 2, '2. irreversible — read these numbers',
      'for comparison: profiles discoverable right now',
      (select count(*)::text from profiles
        where is_discoverable and deleted_at is null)

    -- --------------------------------------------- 3. the one thing deferred
    --
    -- Not counted here: how many members will need to choose a radius. 0011
    -- has not created `discovery_radius_m` yet, and a missing column fails at
    -- plan time however it is guarded — which would take this whole file down
    -- with it. File D reports it after the fact. Expect it to be every
    -- existing member, deliberately: nobody is handed a range they did not
    -- pick.
    union all select 3, '3. deferred to file D',
      'how many members must choose a radius',
      'cannot be counted until 0011 adds the column — see file D'

  ) r
 order by sort, item;
