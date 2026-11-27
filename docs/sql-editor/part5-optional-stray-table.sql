-- ===========================================================================
-- OPTIONAL, and separate from parts 1-4 on purpose: the stray table
-- public."SQL Editor"
--
-- It exists on the live project, it is in NO migration, and on 27 November
-- the REST API returned it to an UNAUTHENTICATED caller with HTTP 200 and an
-- empty array — where `profiles` correctly returned 42501 permission denied.
-- So something created a table in the public schema and left it readable by
-- the anon role. Almost certainly an accident in the SQL editor, which is
-- presumably where the name came from.
--
-- This file does not drop anything. Dropping a table is irreversible and it
-- is your call, so: look first, then decide. Read the output, and only then
-- uncomment one of the two statements at the bottom.
--
-- One statement, one grid. The row count is reached through a lateral over
-- `pg_class`, so if the table is already gone this reports that in a row
-- instead of failing — and an error in the Supabase SQL Editor would abort
-- the script and take the rest of the output with it.
-- ===========================================================================

with t as (
  select c.oid, c.relowner, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'SQL Editor'
),
counted as (
  -- Only evaluated if `t` returned a row, which is what makes this safe.
  select (xpath('/row/c/text()',
           query_to_xml('select count(*) as c from public."SQL Editor"',
                        false, true, '')))[1]::text as cnt
    from t
)
select section, item, value
  from (

    -- ----------------------------------------------------- 1. does it exist
    select 1 as sort, '1. the table' as section,
           'a. exists in the public schema?' as item,
           case when exists (select 1 from t)
                then 'YES' else 'no — nothing to do, stop here' end as value

    union all select 1, '1. the table', 'b. owner',
      coalesce((select pg_get_userbyid(relowner)::text from t), '—')

    union all select 1, '1. the table', 'c. row-level security',
      coalesce((select relrowsecurity::text from t), '—')

    union all select 1, '1. the table', 'd. policies on it',
      coalesce((select count(*)::text from pg_policies
                 where schemaname = 'public' and tablename = 'SQL Editor'), '—')

    -- Decide from this number, not from memory.
    union all select 1, '1. the table', 'e. rows in it',
      coalesce((select cnt from counted), '—')

    -- ------------------- 2. who can read it, which is why REST served it
    union all select 2, '2. who can read it',
      'grantee: ' || grantee::text, privilege_type::text
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'SQL Editor'

    -- ------------------------------------------------------- 3. its shape
    union all select 3, '3. its shape',
      'column: ' || column_name::text, data_type::text
      from information_schema.columns
     where table_schema = 'public' and table_name = 'SQL Editor'

  ) r
 order by sort, item;

-- Only if 1e is 0 and nothing above suggests the table is wanted. Uncomment
-- ONE of these and run it on its own.
--
--   The cautious option — stops the REST API serving it, keeps the table:
--
-- revoke all privileges on table public."SQL Editor" from public, anon, authenticated;
--
--   The tidy option — a table nobody meant to create is not worth keeping:
--
-- drop table public."SQL Editor";
