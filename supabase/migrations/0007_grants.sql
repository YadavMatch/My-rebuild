-- ---------------------------------------------------------------------------
-- The two things a client must never be able to give itself.
--
-- Premium and the verified badge are both granted by something outside the
-- app: a store's receipt, or an identity provider's result. 0001 revoked the
-- client's ability to write either, which left no way to grant them at all.
-- These are that way — reachable only by service_role, which lives on a
-- server, never in the app.
--
-- Deliberately not Edge Functions: a webhook can call an RPC with the
-- service key directly, and SQL is something you can read, test and apply in
-- one place.
-- ---------------------------------------------------------------------------

begin;

-- ----------------------------------------------------------------- billing

create or replace function grant_premium(
  target        uuid,
  expires       timestamptz default null,
  store_name    text        default null,
  transaction_id text       default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into entitlements (user_id, tier, expires_at, store, original_transaction_id, updated_at)
  values (target, 'premium', expires, store_name, transaction_id, now())
  on conflict (user_id) do update
    set tier = 'premium',
        expires_at = excluded.expires_at,
        store = coalesce(excluded.store, entitlements.store),
        original_transaction_id =
          coalesce(excluded.original_transaction_id, entitlements.original_transaction_id),
        updated_at = now();
end;
$$;

-- Lapsed, refunded or cancelled. Kept separate from granting so a webhook
-- cannot downgrade someone by passing a subtly wrong argument.
create or replace function revoke_premium(target uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update entitlements
     set tier = 'free', expires_at = null, updated_at = now()
   where user_id = target;
end;
$$;

-- ------------------------------------------------------------ verification

-- Records the outcome of an identity check and sets the badge when it
-- passed. verification_attempts has no column for an image, and this does
-- not add one: the check runs at the provider, the result is recorded, the
-- photograph never reaches the database.
create or replace function record_verification(
  target   uuid,
  passed   boolean,
  provider text
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into verification_attempts (user_id, passed, provider)
  values (target, passed, provider);

  if passed then
    update profiles
       set verified = true, verified_at = now()
     where id = target;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call these.
--
-- security definer means the function runs as its owner, so execute rights
-- are the only thing standing between a client and a free subscription.
-- Postgres grants execute to public by default, which would hand every
-- signed-in user exactly what 0001 took away.
-- ---------------------------------------------------------------------------

revoke execute on function grant_premium(uuid, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function revoke_premium(uuid)                         from public, anon, authenticated;
revoke execute on function record_verification(uuid, boolean, text)     from public, anon, authenticated;

grant execute on function grant_premium(uuid, timestamptz, text, text) to service_role;
grant execute on function revoke_premium(uuid)                         to service_role;
grant execute on function record_verification(uuid, boolean, text)     to service_role;

commit;
