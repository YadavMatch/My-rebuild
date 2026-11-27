-- Post-migration check. Paste this whole file into the Supabase SQL editor
-- after running the migration.
--
-- Read-only: it inspects the catalogue and writes nothing. Every row should
-- read PASS. Anything else means the migration did not land as intended and
-- the app should not be pointed at this project yet.

with checks as (

  select 1 as n, 'PostGIS installed' as item,
         exists (select 1 from pg_extension where extname = 'postgis') as ok

  union all select 2, 'All 12 tables created',
    (select count(*) from pg_tables where schemaname = 'public'
       and tablename in ('profiles','profiles_private','prompts','profile_prompts',
                         'swipes','matches','messages','blocks','reports',
                         'verification_attempts','entitlements','push_tokens')) = 12

  union all select 3, 'Row-level security on every public table',
    (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0

  union all select 4, 'No table left without a policy',
    (select count(*) from (
       select t.tablename from pg_tables t
       left join pg_policies p on p.schemaname = 'public' and p.tablename = t.tablename
       where t.schemaname = 'public' and t.rowsecurity
       group by t.tablename having count(p.policyname) = 0
     ) x) = 0

  union all select 5, 'is_blocked() exists',
    exists (select 1 from pg_proc where proname = 'is_blocked')

  union all select 6, 'Match trigger installed on swipes',
    exists (select 1 from pg_trigger where tgname = 'swipes_create_match' and not tgisinternal)

  union all select 7, 'Rate-limit trigger installed on swipes',
    exists (select 1 from pg_trigger where tgname = 'swipes_rate_limit' and not tgisinternal)

  union all select 8, 'Signup trigger installed on auth.users',
    exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal)

  union all select 9, 'Clients CANNOT update profiles.verified',
    not has_column_privilege('authenticated', 'public.profiles', 'verified', 'UPDATE')

  union all select 10, 'Clients CAN still update profiles.bio',
    has_column_privilege('authenticated', 'public.profiles', 'bio', 'UPDATE')

  union all select 11, 'Clients CANNOT update entitlements (no Premium self-grant)',
    not has_table_privilege('authenticated', 'public.entitlements', 'UPDATE')

  union all select 12, 'Clients CANNOT write verification_attempts',
    not has_table_privilege('authenticated', 'public.verification_attempts', 'INSERT')

  union all select 13, 'Free daily like cap is 6',
    (select prosrc like '%else 6 end%' from pg_proc where proname = 'enforce_swipe_limit')

  union all select 14, 'discover_feed() exists',
    exists (select 1 from pg_proc where proname = 'discover_feed')

  union all select 15, 'messages published for realtime',
    exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    )

  union all select 16, 'Prompt catalogue seeded',
    (select count(*) from prompts) >= 10

  -- 0008. Checks 17 and 18 fail on a project that has only had 0001 applied.
  union all select 17, '0008: verification_attempts.inquiry_id exists, nullable',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'verification_attempts'
        and column_name = 'inquiry_id' and is_nullable = 'YES'
    )

  union all select 18, '0008: one attempt per (provider, inquiry_id)',
    exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = 'verification_attempts'
        and indexname = 'verification_attempts_provider_inquiry_key'
    )

  -- 19 to 21 belong to 0009 and arrive with it; the gap is deliberate so two
  -- branches adding checks do not fight over the same numbers.

  -- 0010. The default stops new signups appearing; the trigger is what stops
  -- a client asking for discoverability it has not earned.
  union all select 22, '0010: is_discoverable defaults to false',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name = 'is_discoverable' and column_default = 'false'
    )

  union all select 23, '0010: the clamp trigger is on profiles',
    exists (
      select 1 from pg_trigger
      where tgrelid = 'public.profiles'::regclass
        and tgname = 'profiles_clamp_discoverable'
        and not tgisinternal
    )

  -- Not a schema check but a data one, and the reason 0010 is only half the
  -- fix: a default cannot reach rows that already exist. On 27 November this
  -- was 78 rows. See "Profiles that predate 0010" in supabase-setup.md.
  union all select 24, '0010: no placeholder profile is still discoverable',
    not exists (
      select 1 from profiles
      where is_discoverable and deleted_at is null
        and (name is null or btrim(name) = '' or name = 'New member')
    )
)

select n as "#",
       item as "check",
       case when ok then 'PASS' else '*** FAIL ***' end as result
from checks
order by n;
