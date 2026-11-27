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
grant execute on all functions in schema public to authenticated;

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
