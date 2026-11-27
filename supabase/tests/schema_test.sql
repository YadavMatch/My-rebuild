-- Security and behaviour tests for the NearMatch schema.
--
-- These assert the properties the product copy promises. Run them against a
-- throwaway database after any schema change:
--
--   ./supabase/tests/run.sh
--
-- Several of these started out failing. The column-privilege ones in
-- particular: a client could award itself a verified badge, and the first
-- attempt to stop it did not work because a column-level REVOKE does not
-- reduce a table-level GRANT.

\set ON_ERROR_STOP off

insert into auth.users (id, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"name":"Asha"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','{"name":"Bhavin"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','{"name":"Chetna"}');

\echo ''
\echo '=== privileges: what a signed-in client must not be able to do ==='
set role authenticated;
set test.uid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

\echo '-- award itself a verified badge (expect: permission denied)'
update profiles set verified = true where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
\echo '-- award itself Premium (expect: permission denied)'
update entitlements set tier = 'premium' where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
\echo '-- forge a passed verification (expect: permission denied)'
insert into verification_attempts (user_id, passed, provider)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true, 'forged');
\echo '-- create a match out of nothing (expect: RLS violation)'
insert into matches (user_a, user_b)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
\echo '-- edit its own bio (expect: succeeds)'
update profiles set bio = 'legitimate edit' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
reset role;

select verified as must_be_false from profiles where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select tier::text as must_be_free from entitlements where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select count(*) as forged_verifications_must_be_0 from verification_attempts;
select count(*) as forged_matches_must_be_0 from matches;

\echo ''
\echo '=== matching ==='
insert into swipes (actor_id, target_id, decision)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','like');
select count(*) as one_way_like_makes_no_match from matches;

insert into swipes (actor_id, target_id, decision)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','like');
select count(*) as reciprocal_makes_exactly_one from matches;
select (user_a < user_b) as pair_is_canonically_ordered from matches;

\echo '-- the same person twice (expect: unique violation)'
insert into swipes (actor_id, target_id, decision)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','pass');

\echo ''
\echo '=== blocking ==='
insert into messages (match_id, sender_id, body)
  select id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hello' from matches limit 1;

set role authenticated;
set test.uid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select count(*) as before_block_message_visible from messages;
reset role;

insert into blocks (blocker_id, blocked_id)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

set role authenticated;
set test.uid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select count(*) as blocker_sees_0 from messages;
set test.uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select count(*) as blocked_sees_0 from messages;
select count(*) as blocked_sees_profile_0 from profiles
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
reset role;

\echo ''
\echo '=== privacy: who can read what ==='
insert into profiles_private (id, date_of_birth, age_confirmed_at)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','1995-03-02', now());
set role authenticated;
set test.uid = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select count(*) as others_dob_visible_must_be_0 from profiles_private;
select count(*) as others_swipes_visible_must_be_0 from swipes;
reset role;

\echo ''
\echo '=== daily like cap ==='
insert into auth.users (id) select gen_random_uuid() from generate_series(1, 12);
select count(*) as chetna_likes_before from swipes where actor_id='cccccccc-cccc-cccc-cccc-cccccccccccc';
insert into swipes (actor_id, target_id, decision)
  select 'cccccccc-cccc-cccc-cccc-cccccccccccc', id, 'like' from profiles
  where id <> 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    and id not in (select target_id from swipes where actor_id='cccccccc-cccc-cccc-cccc-cccccccccccc')
  limit 6;
select count(*) as six_likes_allowed from swipes
  where actor_id='cccccccc-cccc-cccc-cccc-cccccccccccc' and decision <> 'pass';

\echo '-- the 7th like (expect: daily_like_limit_reached)'
insert into swipes (actor_id, target_id, decision)
  select 'cccccccc-cccc-cccc-cccc-cccccccccccc', id, 'like' from profiles
  where id <> 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    and id not in (select target_id from swipes where actor_id='cccccccc-cccc-cccc-cccc-cccccccccccc')
  limit 1;

\echo '-- a pass at the cap (expect: succeeds; a limit must not trap you)'
insert into swipes (actor_id, target_id, decision)
  select 'cccccccc-cccc-cccc-cccc-cccccccccccc', id, 'pass' from profiles
  where id <> 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    and id not in (select target_id from swipes where actor_id='cccccccc-cccc-cccc-cccc-cccccccccccc')
  limit 1;
select count(*) as pass_at_cap_must_be_1 from swipes
  where actor_id='cccccccc-cccc-cccc-cccc-cccccccccccc' and decision = 'pass';

update entitlements set tier='premium' where user_id='cccccccc-cccc-cccc-cccc-cccccccccccc';
insert into swipes (actor_id, target_id, decision)
  select 'cccccccc-cccc-cccc-cccc-cccccccccccc', id, 'like' from profiles
  where id <> 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    and id not in (select target_id from swipes where actor_id='cccccccc-cccc-cccc-cccc-cccccccccccc')
  limit 1;
select count(*) as premium_lifts_cap_to_7 from swipes
  where actor_id='cccccccc-cccc-cccc-cccc-cccccccccccc' and decision <> 'pass';

\echo ''
\echo '=== one inquiry records one attempt (0008) ==='
-- A webhook retry must not turn one check into two rows. Persona retries up
-- to seven more times and does not guarantee order, so this is the property
-- the handler's upsert depends on.
insert into verification_attempts (user_id, passed, provider, inquiry_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 'persona', 'inq_retry');
\echo '-- the same inquiry delivered again (expect: unique violation)'
insert into verification_attempts (user_id, passed, provider, inquiry_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 'persona', 'inq_retry');
\echo '-- the same id from a different provider (expect: succeeds)'
insert into verification_attempts (user_id, passed, provider, inquiry_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 'other', 'inq_retry');
\echo '-- two rows with no inquiry id (expect: succeeds; pre-0008 rows)'
insert into verification_attempts (user_id, passed, provider) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 'legacy'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 'legacy');
select count(*) as persona_inq_retry_must_be_1 from verification_attempts
  where provider = 'persona' and inquiry_id = 'inq_retry';
select count(*) as null_inquiry_rows_must_be_2 from verification_attempts
  where inquiry_id is null;

\echo '-- a client still cannot write one, inquiry id or not (expect: permission denied)'
set role authenticated;
set test.uid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
insert into verification_attempts (user_id, passed, provider, inquiry_id)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true, 'persona', 'inq_forged');
reset role;
select count(*) as forged_with_inquiry_id_must_be_0 from verification_attempts
  where inquiry_id = 'inq_forged';

\echo ''
\echo '=== every public table has RLS enabled ==='
select count(*) as tables_without_rls_must_be_0
from pg_tables where schemaname='public' and not rowsecurity;

\echo ''
\echo '=== location is not on profiles at all (0003) ==='
-- 0002 hid geo with column privileges, which made `select *` on profiles
-- fail. 0003 moved it to the owner-only table instead, so profiles is
-- plainly readable again and there is no column to forget about.
select
  (select count(*) from information_schema.columns
    where table_name = 'profiles' and column_name = 'geo')         as on_profiles_must_be_0,
  (select count(*) from information_schema.columns
    where table_name = 'profiles_private' and column_name = 'geo') as on_private_must_be_1;

\echo '=== profiles is readable again, including select * (0003) ==='
select
  has_table_privilege('authenticated', 'profiles', 'SELECT')          as profiles_select_must_be_true,
  has_column_privilege('authenticated', 'profiles', 'name', 'SELECT') as name_must_be_true;

\echo '=== and the private table stays owner-only ==='
select count(*) as private_policies_must_be_3
from pg_policies where tablename = 'profiles_private';

\echo '=== discover_feed does not return a geo column ==='
select count(*) filter (where lower(t.name) = 'geo') as geo_cols_must_be_0,
       count(*)                                      as total_cols
from (
  select unnest(proargnames) as name
  from pg_proc where proname = 'discover_feed'
) t;

\echo ''
\echo '=== the photo bucket is private and limited (0005) ==='
select
  (select count(*) from storage.buckets where id = 'profile-photos')            as bucket_must_be_1,
  (select public from storage.buckets where id = 'profile-photos')              as public_must_be_false,
  (select count(*) from pg_policies
     where tablename = 'objects' and policyname like 'profile_photos%')         as policies_must_be_4;

\echo '=== a message notifies the other person, and only them (0006) ==='
-- Two people in a match, the recipient has a device registered.
insert into auth.users (id) values
  ('eeee1111-0000-0000-0000-000000000001'),
  ('eeee1111-0000-0000-0000-000000000002');
insert into push_tokens (user_id, token, platform)
  values ('eeee1111-0000-0000-0000-000000000002', 'ExponentPushToken[recipient]', 'ios');
insert into matches (user_a, user_b) values
  (least('eeee1111-0000-0000-0000-000000000001'::uuid,'eeee1111-0000-0000-0000-000000000002'::uuid),
   greatest('eeee1111-0000-0000-0000-000000000001'::uuid,'eeee1111-0000-0000-0000-000000000002'::uuid));

insert into messages (match_id, sender_id, body)
select id, 'eeee1111-0000-0000-0000-000000000001', 'knock knock' from matches
where user_a = least('eeee1111-0000-0000-0000-000000000001'::uuid,'eeee1111-0000-0000-0000-000000000002'::uuid);

select
  (select count(*) from net._calls)                                   as pushes_must_be_1,
  (select body -> 0 ->> 'to'   from net._calls limit 1)
    = 'ExponentPushToken[recipient]'                                  as goes_to_the_recipient,
  (select body -> 0 ->> 'body' from net._calls limit 1)
    = 'knock knock'                                                   as carries_the_text,
  (select body -> 0 -> 'data' ->> 'url' from net._calls limit 1)
    like '/chat/%'                                                    as deep_links_to_the_chat;

\echo '=== a block stops the notification ==='
truncate net._calls;
insert into blocks (blocker_id, blocked_id)
  values ('eeee1111-0000-0000-0000-000000000002', 'eeee1111-0000-0000-0000-000000000001');
insert into messages (match_id, sender_id, body)
select id, 'eeee1111-0000-0000-0000-000000000001', 'again' from matches
where user_a = least('eeee1111-0000-0000-0000-000000000001'::uuid,'eeee1111-0000-0000-0000-000000000002'::uuid);
select count(*) as pushes_after_block_must_be_0 from net._calls;

\echo ''
\echo '=== a client cannot call the grant functions (0007) ==='
-- Attempted, not inspected. has_function_privilege reports what the catalogue
-- says; only a call proves what the server does, and the column-grant bug in
-- 0001 was exactly a case of the two disagreeing.
insert into auth.users (id) values ('aaaa9999-0000-0000-0000-000000000009');
set role authenticated;
\echo '-- authenticated grants itself Premium (expect: permission denied)'
select grant_premium('aaaa9999-0000-0000-0000-000000000009');
\echo '-- authenticated awards itself the badge (expect: permission denied)'
select record_verification('aaaa9999-0000-0000-0000-000000000009', true, 'self');
reset role;
select
  coalesce((select tier::text from entitlements
             where user_id = 'aaaa9999-0000-0000-0000-000000000009'), 'free')
    as tier_must_still_be_free,
  (select verified from profiles
    where id = 'aaaa9999-0000-0000-0000-000000000009') as verified_must_be_false;

\echo '=== and the grants work when a server calls them ==='
insert into auth.users (id) values ('ffff2222-0000-0000-0000-000000000001');
select grant_premium('ffff2222-0000-0000-0000-000000000001', now() + interval '30 days', 'apple', 'tx-1');
select tier as tier_must_be_premium, (expires_at > now()) as not_expired_must_be_true
  from entitlements where user_id = 'ffff2222-0000-0000-0000-000000000001';

select record_verification('ffff2222-0000-0000-0000-000000000001', true, 'test-provider');
select verified as verified_must_be_true from profiles
  where id = 'ffff2222-0000-0000-0000-000000000001';
select count(*) as attempts_must_be_1 from verification_attempts
  where user_id = 'ffff2222-0000-0000-0000-000000000001';

select revoke_premium('ffff2222-0000-0000-0000-000000000001');
select tier as tier_must_be_free from entitlements
  where user_id = 'ffff2222-0000-0000-0000-000000000001';

\echo '=== a failed check records the attempt and grants nothing ==='
insert into auth.users (id) values ('ffff2222-0000-0000-0000-000000000002');
select record_verification('ffff2222-0000-0000-0000-000000000002', false, 'test-provider');
select verified as verified_must_be_false from profiles
  where id = 'ffff2222-0000-0000-0000-000000000002';

\echo ''
\echo '=== deleting your own account (0009) ==='

-- Two accounts, so "A deleted itself" can be told apart from "A deleted
-- everyone".
insert into auth.users (id) values ('dddd0000-0000-0000-0000-00000000000a');
insert into auth.users (id) values ('dddd0000-0000-0000-0000-00000000000b');

\echo '-- the direct write is now refused (expect: permission denied for column)'
set role authenticated;
set test.uid = 'dddd0000-0000-0000-0000-00000000000a';
update profiles set deleted_at = now() where id = 'dddd0000-0000-0000-0000-00000000000a';
reset role;
select count(*) as direct_write_must_be_0 from profiles
  where id = 'dddd0000-0000-0000-0000-00000000000a' and deleted_at is not null;

\echo '-- but the function works, for the caller only (expect: succeeds)'
set role authenticated;
set test.uid = 'dddd0000-0000-0000-0000-00000000000a';
select delete_my_profile();
reset role;
select
  (select deleted_at is not null from profiles where id = 'dddd0000-0000-0000-0000-00000000000a')
    as a_deleted_must_be_true,
  (select is_discoverable from profiles where id = 'dddd0000-0000-0000-0000-00000000000a')
    as a_discoverable_must_be_false,
  (select deleted_at is null from profiles where id = 'dddd0000-0000-0000-0000-00000000000b')
    as b_untouched_must_be_true;

\echo '-- calling it twice does not move the timestamp (expect: unchanged)'
-- Read the stamp outside RLS: profiles_readable hides the row now that it is
-- deleted, which is the whole reason this function has to exist.
select deleted_at as first_stamp from profiles
  where id = 'dddd0000-0000-0000-0000-00000000000a' \gset
set role authenticated;
set test.uid = 'dddd0000-0000-0000-0000-00000000000a';
select delete_my_profile();
reset role;
select (deleted_at = :'first_stamp'::timestamptz) as stamp_unchanged_must_be_true
  from profiles where id = 'dddd0000-0000-0000-0000-00000000000a';

\echo '-- anon cannot even call it (expect: permission denied for function)'
-- Stronger than the in-function auth.uid() guard, which is kept as a second
-- line for any role that has execute but no identity.
set role anon;
select delete_my_profile();
reset role;

\echo '-- and a deleted profile is gone from the deck'
set role authenticated;
set test.uid = 'dddd0000-0000-0000-0000-00000000000b';
select count(*) as deleted_in_feed_must_be_0 from discover_feed()
  where id = 'dddd0000-0000-0000-0000-00000000000a';
reset role;

\echo '=== a profile is not discoverable until it is ready (0010) ==='

insert into auth.users (id) values ('eeee0000-0000-0000-0000-00000000000a');

\echo '-- a fresh signup is invisible, with the name the trigger invented'
select
  (select name from profiles where id = 'eeee0000-0000-0000-0000-00000000000a')
    as name_must_be_new_member,
  (select is_discoverable from profiles where id = 'eeee0000-0000-0000-0000-00000000000a')
    as fresh_discoverable_must_be_false;

\echo '-- asking to be discoverable with the placeholder name does not work'
set role authenticated;
set test.uid = 'eeee0000-0000-0000-0000-00000000000a';
update profiles set is_discoverable = true
  where id = 'eeee0000-0000-0000-0000-00000000000a';
reset role;
select is_discoverable as placeholder_discoverable_must_be_false from profiles
  where id = 'eeee0000-0000-0000-0000-00000000000a';

\echo '-- nor with a real name but no recorded date of birth'
set role authenticated;
set test.uid = 'eeee0000-0000-0000-0000-00000000000a';
update profiles set name = 'Asha', is_discoverable = true
  where id = 'eeee0000-0000-0000-0000-00000000000a';
reset role;
select is_discoverable as no_dob_discoverable_must_be_false from profiles
  where id = 'eeee0000-0000-0000-0000-00000000000a';

\echo '-- with both, it works'
insert into profiles_private (id, date_of_birth, age_confirmed_at)
  values ('eeee0000-0000-0000-0000-00000000000a', '1996-04-01', now());
set role authenticated;
set test.uid = 'eeee0000-0000-0000-0000-00000000000a';
update profiles set is_discoverable = true
  where id = 'eeee0000-0000-0000-0000-00000000000a';
reset role;
select is_discoverable as ready_discoverable_must_be_true from profiles
  where id = 'eeee0000-0000-0000-0000-00000000000a';

\echo '-- hiding is always allowed'
set role authenticated;
set test.uid = 'eeee0000-0000-0000-0000-00000000000a';
update profiles set is_discoverable = false
  where id = 'eeee0000-0000-0000-0000-00000000000a';
reset role;
select is_discoverable as hidden_must_be_false from profiles
  where id = 'eeee0000-0000-0000-0000-00000000000a';

\echo '-- and a deleted profile cannot be discoverable even when complete'
update profiles set is_discoverable = true, deleted_at = now()
  where id = 'eeee0000-0000-0000-0000-00000000000a';
select is_discoverable as deleted_discoverable_must_be_false from profiles
  where id = 'eeee0000-0000-0000-0000-00000000000a';

