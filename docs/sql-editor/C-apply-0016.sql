-- ===========================================================================
-- C of 4: MIGRATION 0016 — THE ONE THAT HIDES PROFILES
--
-- Separate from B on purpose, so you choose this one deliberately.
--
-- It does two things that cannot be undone:
--
--   * nulls every fabricated 1900-01-01 date of birth, because those were
--     never declarations — 0003 wrote one for each row it carried over, and
--     saveLocation wrote one whenever it created a row
--   * takes out of the deck anyone who is discoverable today on one of those
--     dates, because 0010's gate reads "has a date of birth" as "declared
--     their age", and a sentinel satisfied it
--
-- File A printed both counts. If the number of profiles this hides surprised
-- you, that is the bug rather than this migration: those profiles were being
-- shown as 18 without anybody having said so.
--
-- Do not paste this until you have read those numbers and are content.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A date of birth now means somebody told us one.
--
-- `profiles_private.date_of_birth` is `not null`, and two places had nothing
-- to put in it, so both invented the same date:
--
--   0003_move_geo_private.sql, carrying rows over from the old geo column:
--     insert into profiles_private (id, date_of_birth, age_confirmed_at, geo)
--     select p.id, date '1900-01-01', now(), p.geo ...
--
--   saveLocation in src/services/supabase-service.ts, when no row exists yet:
--     date_of_birth: '1900-01-01'
--
-- That was harmless until 0010, which decides whether a profile may appear in
-- the deck and asks this:
--
--     where pr.id = new.id and pr.date_of_birth is not null
--
-- A sentinel is not null. So a profile with a fabricated date of birth passes
-- the gate that exists to keep profiles out of the deck until a person has
-- actually declared their age — and it is shown with `age = 18`, the
-- placeholder the signup trigger writes.
--
-- The reachable path, which is not exotic: sign in on a device that no longer
-- holds the age-gate state, so `recordAgeConfirmation` is skipped (sign-in.tsx
-- guards on `state.dateOfBirth && state.ageConfirmedAt`, and swallows failures
-- with `.catch(() => {})`), then set a location. The row is created with the
-- sentinel, 0010 is satisfied, and the profile becomes discoverable claiming
-- to be 18 without anybody having said so.
--
-- For a dating app, being over 18 is the claim. A placeholder standing in for
-- it is the one piece of invented data that must not exist.
--
-- THE FIX, in the order it has to happen:
--
--   1. The column becomes nullable, so "has not told us" is representable at
--      all. This is what lets the sentinel go away instead of being special-
--      cased: 0010's `is not null` then means exactly what it says.
--   2. Existing sentinels become NULL. Those rows never declared anything.
--   3. A check constraint makes the sentinel unwritable, so the next piece of
--      code that has nothing to put in the column fails loudly rather than
--      inventing a date. 0010's gate stops depending on client good manners.
--   4. Anyone currently discoverable on a fabricated date is hidden. 0010's
--      trigger only fires on write, so without this they would stay in the
--      deck until something happened to touch their row — which might be
--      never.
--
-- The check has a lower bound only. An upper bound wants `current_date`, which
-- is not immutable, and a check constraint that changes meaning with the clock
-- is re-validated on restore and can fail there. Rejecting future dates
-- belongs in the age gate, not here.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

begin;

-- 1. "Nobody has told us" becomes representable.
alter table profiles_private alter column date_of_birth drop not null;

-- 2. The sentinels were never declarations. Say so.
update profiles_private
   set date_of_birth = null
 where date_of_birth = date '1900-01-01';

-- 3. And make it unwritable from here on.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_private_date_of_birth_plausible'
  ) then
    alter table profiles_private
      add constraint profiles_private_date_of_birth_plausible
      check (date_of_birth is null or date_of_birth > date '1900-01-01');
  end if;
end;
$$;

comment on column profiles_private.date_of_birth is
  'The date of birth the member declared at the age gate. NULL means they have '
  'not declared one, which 0010 treats as not discoverable. Never write a '
  'placeholder here: a check constraint rejects 1900-01-01 and earlier, '
  'because a fabricated date of birth in a dating app is a fabricated 18+ '
  'declaration.';

-- 4. Anyone already in the deck on a date nobody supplied comes out of it.
update profiles
   set is_discoverable = false
 where is_discoverable
   and exists (
     select 1 from profiles_private pr
     where pr.id = profiles.id and pr.date_of_birth is null
   );

commit;
