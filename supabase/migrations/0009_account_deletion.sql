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
