-- ===========================================================================
-- Part 4 of 4: THE PLACEHOLDER PROFILES  (part 2 of issue #13)
--
-- 0010 stops NEW signups appearing before onboarding. It cannot reach rows
-- that already exist: a column default only applies to new rows, and the
-- clamp trigger fires on write, so a row nobody updates stays as it is.
--
-- This DELETES NOBODY. It takes them out of every feed and leaves the
-- accounts intact, which matters because some may be real people who
-- abandoned onboarding and could come back and finish it.
--
-- Idempotent: running it again updates 0 rows.
-- ===========================================================================

update profiles
   set is_discoverable = false
 where is_discoverable
   and deleted_at is null
   and (name is null or btrim(name) = '' or name = 'New member');

-- Should now be 0.
select count(*) as placeholder_profiles_still_discoverable
  from profiles
 where is_discoverable and deleted_at is null
   and (name is null or btrim(name) = '' or name = 'New member');
