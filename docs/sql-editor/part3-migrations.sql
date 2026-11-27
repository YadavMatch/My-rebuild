-- ===========================================================================
-- Part 3 of 4: MIGRATIONS 0009 AND 0010
--
-- Copied verbatim from the repository, not retyped: 0009_account_deletion.sql
-- and 0010_discoverable_when_ready.sql as they exist on main. Both are
-- wrapped in their own transaction and both are safe to run twice, so a
-- second paste is a no-op rather than an error.
--
-- 0009 lets a member delete their own account, which the schema documented
-- and the policies refused.
-- 0010 stops a half-finished signup appearing in everyone's deck.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Deleting your own account.
--
-- `profiles.deleted_at` is the documented soft-delete mechanism, and until now
-- a client could not set it. The column was in the update grant and
-- data-model.md described it as the way out, but the write was refused:
--
--   ERROR: new row violates row-level security policy for table "profiles"
--
-- Not the UPDATE policy — `profiles_self_write` permits it. The SELECT policy
-- is what refuses:
--
--   create policy profiles_readable on profiles for select using (
--     deleted_at is null and (id = auth.uid() or not is_blocked(auth.uid(), id))
--   );
--
-- Postgres will not let a client update its own row into a state its SELECT
-- policy would hide, and setting `deleted_at` hides it. So the one documented
-- route to erasure could not be taken by the only party entitled to take it.
--
-- Two ways out were open. Relaxing `profiles_readable` to let an owner see
-- their own deleted row would have made the direct update work, at the cost of
-- making deleted profiles readable again. This takes the other: the policy
-- stays strict, and the write happens in a `security definer` function, which
-- is not subject to RLS.
--
-- The function takes NO argument. It reads `auth.uid()` and nothing else, so
-- there is no parameter through which one account could delete another — the
-- property worth having in a function that bypasses RLS.
--
-- `deleted_at` is then revoked from the client's update grant, because leaving
-- it there advertises a write that is refused.
--
-- SCOPE: this soft-deletes, which is what `deleted_at` means and what the data
-- model describes — the person leaves every feed, match and conversation.
-- It deliberately does NOT purge. What becomes of messages the other party
-- already received is an open question in data-model.md, and a retention
-- decision rather than a schema one; erasure under the DPDP Act may need more
-- than this. Settle that separately. This only makes the documented mechanism
-- reachable by its owner.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

begin;

create or replace function delete_my_profile()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  -- security definer bypasses RLS, so the caller's identity is the only
  -- thing standing between this and someone else's row. An anonymous caller
  -- would otherwise match no row and leave silently, which reads like
  -- success.
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- `deleted_at is null` makes a second call a no-op rather than moving the
  -- timestamp, so a client that retries cannot rewrite when it happened.
  update profiles
     set deleted_at      = now(),
         is_discoverable = false
   where id = auth.uid()
     and deleted_at is null;
end;
$$;

revoke execute on function delete_my_profile() from public, anon;
grant  execute on function delete_my_profile() to authenticated;

-- The grant that promised what the policy refused.
revoke update (deleted_at) on profiles from authenticated;

commit;


-- ---------------------------------------------------------------------------
-- A profile is not discoverable until there is something to discover.
--
-- `handle_new_user()` creates a profile the moment an account exists, filling
-- in what it cannot know:
--
--   insert into profiles (id, name, age)
--   values (new.id, coalesce(new.raw_user_meta_data->>'name', 'New member'), 18)
--
-- `is_discoverable` then defaulted to true, so a signup that stopped before
-- onboarding sat in everyone's deck as a nameless, photoless, age-18 profile.
-- On the live project on 27 November that was 78 of 106 rows. Nobody had seen
-- them only because the app was still reading seed data.
--
-- Two things were wrong with that, and they are different in kind. Inventing a
-- display name is cosmetic. Asserting `age = 18` for someone who never said so
-- is a claim about a person, in a product where being over 18 is the thing
-- being claimed.
--
-- So: the default becomes false, and a trigger holds a profile out of the deck
-- until it has a real name and the age gate has recorded a date of birth.
-- `age` stays a placeholder on an incomplete profile, but an incomplete
-- profile is no longer visible to anyone, so the placeholder stops being an
-- assertion about anybody.
--
-- The trigger only ever clamps to false. It never forces true, so
-- `is_discoverable` remains a setting the owner writes rather than becoming
-- derived state — the column stays in the client's update grant and means what
-- it says. `updateMyProfile` sets it when a profile is saved; the database
-- decides whether that sticks.
--
-- KNOWN INTERACTION: there is no "hide me" feature today. When one is added,
-- note that saving a profile sets `is_discoverable` true, so hiding will need
-- its own column rather than reusing this one — otherwise an edit un-hides.
--
-- This does NOT touch the 78 rows already there. Their `is_discoverable` is
-- already true and a default only applies to new rows; the trigger clamps them
-- the next time each is updated, which may be never. Clearing them out needs
-- the service role — see issue #13, part 1.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

begin;

alter table profiles alter column is_discoverable set default false;

create or replace function clamp_discoverable()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  has_dob boolean;
begin
  -- Nothing to clamp: a profile being hidden is always allowed.
  if not new.is_discoverable then
    return new;
  end if;

  -- A deleted profile is never in the deck, whatever else it says.
  if new.deleted_at is not null then
    new.is_discoverable := false;
    return new;
  end if;

  -- The name the trigger invents, an empty one, or whitespace: all mean
  -- onboarding has not happened.
  if new.name is null
     or btrim(new.name) = ''
     or new.name = 'New member' then
    new.is_discoverable := false;
    return new;
  end if;

  -- `age` on profiles is maintained from profiles_private.date_of_birth, so
  -- the date of birth is what tells us a person stated their age rather than
  -- inheriting the placeholder.
  select exists (
    select 1 from profiles_private pr
    where pr.id = new.id and pr.date_of_birth is not null
  ) into has_dob;

  if not has_dob then
    new.is_discoverable := false;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_clamp_discoverable on profiles;

create trigger profiles_clamp_discoverable
  before insert or update on profiles
  for each row execute function clamp_discoverable();

commit;
