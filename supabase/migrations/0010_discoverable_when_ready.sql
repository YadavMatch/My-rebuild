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
