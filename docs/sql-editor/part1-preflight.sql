-- ===========================================================================
-- NearMatch — SQL Editor, part 1 of 4: PREFLIGHT
--
-- Read-only. Nothing here changes anything. Run it first so you know what is
-- already applied instead of guessing, and keep the output to compare against
-- part 4.
-- ===========================================================================

select 'migration 0008 (verification inquiry_id)' as item,
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='verification_attempts'
           and column_name='inquiry_id'
       ) then 'applied' else 'NOT applied' end as state
union all
select 'migration 0009 (delete_my_profile)',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='delete_my_profile'
       ) then 'applied' else 'NOT applied' end
union all
select 'migration 0010 (is_discoverable defaults false)',
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='profiles'
           and column_name='is_discoverable' and column_default='false'
       ) then 'applied' else 'NOT applied' end
union all
select 'migration 0010 (clamp trigger)',
       case when exists (
         select 1 from pg_trigger
         where tgrelid='public.profiles'::regclass
           and tgname='profiles_clamp_discoverable' and not tgisinternal
       ) then 'applied' else 'NOT applied' end
union all
select 'realtime: messages published',
       case when exists (
         select 1 from pg_publication_tables
         where pubname='supabase_realtime' and schemaname='public' and tablename='messages'
       ) then 'yes' else 'NO — part 2 fixes this' end
union all
select 'placeholder profiles still discoverable',
       (select count(*)::text from profiles
         where is_discoverable and deleted_at is null
           and (name is null or btrim(name)='' or name='New member'))
union all
select 'stray table public."SQL Editor" exists',
       case when exists (
         select 1 from information_schema.tables
         where table_schema='public' and table_name='SQL Editor'
       ) then 'yes — see part 4 notes' else 'no' end
order by item;
