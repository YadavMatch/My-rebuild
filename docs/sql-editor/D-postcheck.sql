-- ===========================================================================
-- D of 4: POST-CHECK
--
-- READ-ONLY. Run file A again afterwards too, and compare: every row in its
-- first section should now read "applied".
--
-- One statement, one grid — see the note at the top of file A for why.
--
-- Every row in section 1 should read PASS. Section 2 is a count, not a test:
-- expect every pre-existing member to need a radius. 0011 leaves it unset on
-- purpose, because no radius was ever persisted for anybody, so there was
-- nothing to preserve, and defaulting them to 10 km would have handed people
-- a range they did not pick. They see a prompt, not a feed, until they choose.
--
-- AFTERWARDS: run supabase/tests/verify_on_supabase.sql for all 27 checks.
-- Only two are expected to need attention there:
--     1   PostGIS installed                  — should PASS on this project
--     15  messages published for realtime     — PASSes only once part 2 has run
-- ===========================================================================

select section, item, result
  from (

    select 1 as sort, '1. did it land?' as section,
           '0016: no fabricated dates of birth remain' as item,
           case when not exists (select 1 from profiles_private
             where date_of_birth = date '1900-01-01')
           then 'PASS' else '*** FAIL ***' end as result

    union all select 1, '1. did it land?',
      '0016: nobody is discoverable without a declared age',
      case when not exists (
        select 1 from profiles p join profiles_private pr on pr.id = p.id
         where p.is_discoverable and p.deleted_at is null
           and pr.date_of_birth is null)
      then 'PASS' else '*** FAIL ***' end

    union all select 1, '1. did it land?',
      '0011: every stored location is on the ~1 km grid',
      case when not exists (
        select 1 from profiles_private
         where geo is not null
           and (round(extensions.st_x(geo::extensions.geometry)::numeric, 2)
                  <> round(extensions.st_x(geo::extensions.geometry)::numeric, 6)
             or round(extensions.st_y(geo::extensions.geometry)::numeric, 2)
                  <> round(extensions.st_y(geo::extensions.geometry)::numeric, 6)))
      then 'PASS' else '*** FAIL ***' end

    union all select 1, '1. did it land?',
      '0011: a caller cannot pass their own radius',
      case when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'discover_feed'
           and not ('max_distance_m' = any (p.proargnames)))
      then 'PASS' else '*** FAIL ***' end

    union all select 1, '1. did it land?',
      '0012: a photo is no longer readable by every signed-in account',
      case when exists (select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'profile_photos_read' and qual like '%matches%')
      then 'PASS' else '*** FAIL ***' end

    union all select 1, '1. did it land?',
      '0013: the like cap holds under concurrency',
      case when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'enforce_swipe_limit'
           and pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock%')
      then 'PASS' else '*** FAIL ***' end

    union all select 1, '1. did it land?',
      '0014: the message rate-limit trigger is live',
      case when exists (select 1 from pg_trigger
        where tgrelid = 'public.messages'::regclass
          and tgname = 'messages_rate_limit' and not tgisinternal)
      then 'PASS' else '*** FAIL ***' end

    union all select 1, '1. did it land?',
      '0015: a client cannot read the moderation queue',
      case when not has_function_privilege(
        'authenticated', 'public.moderation_queue(integer)', 'execute')
      then 'PASS' else '*** FAIL ***' end

    -- ------------------------------------------------ 2. radius adoption
    union all select 2, '2. radius adoption (a count, not a test)',
      'members who still need to choose a radius',
      (select count(*)::text from profiles_private
        where discovery_radius_m is null)

    union all select 2, '2. radius adoption (a count, not a test)',
      'members who have chosen one',
      (select count(*)::text from profiles_private
        where discovery_radius_m is not null)

  ) r
 order by sort, item;
