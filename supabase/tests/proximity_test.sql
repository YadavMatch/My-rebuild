-- Proximity discovery, against real PostGIS. Run through run_proximity.sh.
--
-- Every separation below was measured with st_distance rather than estimated,
-- so the cutoff cases sit where they claim to:
--
--   Bharat    (77.24, 28.64)    2.25 km  inside 10 km, and inside the 5 km band
--   Saket     (77.21, 28.52)   12.2 km   same city, outside 10 km
--   Chitra    (77.46, 28.63)   23.5 km   just inside 25 km
--   Faridabad (77.31, 28.41)   25.9 km   just outside 25 km
--   Gurugram  (77.03, 28.46)   26.5 km   Haryana
--   Meerut    (77.71, 28.98)   61.6 km   Uttar Pradesh
--   Panipat   (76.97, 29.39)   87.7 km   the brief's ~90 km example
--   Karnal    (76.99, 29.69)  119.6 km   inside 150, outside 100
--   Agra      (78.01, 27.18)  178.5 km   beyond every preset
--
-- All from Asha at Delhi CP (77.22, 28.63). Coordinates are already at two
-- decimal places, so coarsening does not move them and the numbers stay exact.

\pset pager off

-- A member with a profile, an age, a location and a radius. profiles_private
-- goes in before the profile is made discoverable, because 0010's clamp wants
-- a date of birth on file before it will allow it.
create function seed_member(
  uid uuid, nm text, label text, lon float8, lat float8, radius int
) returns void language plpgsql as $$
begin
  insert into auth.users (id) values (uid);
  insert into profiles_private (id, date_of_birth, age_confirmed_at, geo, discovery_radius_m)
  values (
    uid, '1996-04-01', now(),
    extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography,
    radius
  );
  update profiles
     set name = nm, location_label = label, is_discoverable = true,
         last_active_at = now()
   where id = uid;
end;
$$;

-- Calls the feed as a member and counts what comes back for one candidate.
create function sees(viewer uuid, candidate uuid) returns boolean
language plpgsql as $$
declare hit int;
begin
  perform set_config('test.uid', viewer::text, true);
  select count(*) into hit from discover_feed(50, 0) f where f.id = candidate;
  return hit > 0;
end;
$$;

create function feed_size(viewer uuid) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('test.uid', viewer::text, true);
  select count(*) into n from discover_feed(50, 0);
  return n;
end;
$$;

create function set_radius(uid uuid, radius int) returns void language sql as $$
  update profiles_private set discovery_radius_m = radius where id = uid;
$$;

\echo ''
\echo '=== the radius column: default, legacy, and the supported six ==='

-- A row created now, with no radius named, takes the 10 km default.
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000aa');
insert into profiles_private (id, date_of_birth, age_confirmed_at)
  values ('00000000-0000-0000-0000-0000000000aa', '1996-04-01', now());
select discovery_radius_m as new_member_default_must_be_10000
  from profiles_private where id = '00000000-0000-0000-0000-0000000000aa';

-- A row that predates 0011 has NULL: not chosen, so the member is asked.
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000bb');
insert into profiles_private (id, date_of_birth, age_confirmed_at, discovery_radius_m)
  values ('00000000-0000-0000-0000-0000000000bb', '1996-04-01', now(), null);
select discovery_radius_m is null as legacy_row_must_be_unset
  from profiles_private where id = '00000000-0000-0000-0000-0000000000bb';

\echo '-- every supported preset is accepted'
select count(*) as presets_accepted_must_be_6 from (
  select set_radius('00000000-0000-0000-0000-0000000000aa', r)
  from unnest(array[10000, 25000, 50000, 75000, 100000, 150000]) r
) accepted;

\echo '-- an unsupported value is refused (expect: check constraint violation)'
select set_radius('00000000-0000-0000-0000-0000000000aa', 30000);

\echo '-- and a negative one'
select set_radius('00000000-0000-0000-0000-0000000000aa', -5000);

\echo ''
\echo '=== stored locations are coarsened on write ==='

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000cc');
insert into profiles_private (id, date_of_birth, age_confirmed_at, geo)
values (
  '00000000-0000-0000-0000-0000000000cc', '1996-04-01', now(),
  extensions.st_setsrid(extensions.st_makepoint(77.216789, 28.634567), 4326)::extensions.geography
);
select
  round(extensions.st_x(geo::extensions.geometry)::numeric, 6) as lon_must_be_77_220000,
  round(extensions.st_y(geo::extensions.geometry)::numeric, 6) as lat_must_be_28_630000
from profiles_private where id = '00000000-0000-0000-0000-0000000000cc';

\echo ''
\echo '=== the cast of members ==='

select seed_member('a0000000-0000-0000-0000-00000000000a', 'Asha',    'New Delhi',  77.22, 28.63, 10000);
select seed_member('b0000000-0000-0000-0000-00000000000b', 'Bharat',  'New Delhi',  77.24, 28.64, 10000);
select seed_member('e0000000-0000-0000-0000-00000000000e', 'Esha',    'New Delhi',  77.21, 28.52, 10000);
select seed_member('c0000000-0000-0000-0000-00000000000c', 'Chitra',  'Noida',      77.46, 28.63, 25000);
select seed_member('d0000000-0000-0000-0000-00000000000d', 'Devi',    'Faridabad',  77.31, 28.41, 25000);
select seed_member('f0000000-0000-0000-0000-00000000000f', 'Farah',   'Gurugram',   77.03, 28.46, 50000);
select seed_member('10000000-0000-0000-0000-000000000001', 'Gita',    'Meerut',     77.71, 28.98, 75000);
select seed_member('20000000-0000-0000-0000-000000000002', 'Hari',    'Panipat',    76.97, 29.39, 100000);
select seed_member('30000000-0000-0000-0000-000000000003', 'Iqbal',   'Karnal',     76.99, 29.69, 150000);
select seed_member('40000000-0000-0000-0000-000000000004', 'Jaya',    'Agra',       78.01, 27.18, 150000);

\echo ''
\echo '=== the 10 km default: close enough, and not ==='

select
  sees('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b')
    as at_10km_sees_2_25km_must_be_true,
  sees('a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000e')
    as at_10km_sees_12km_must_be_false,
  feed_size('a0000000-0000-0000-0000-00000000000a')
    as at_10km_feed_size_must_be_1;

\echo '-- same city, outside the range each chose: neither sees the other'
select
  sees('e0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-00000000000a')
    as saket_sees_cp_must_be_false,
  sees('a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000e')
    as cp_sees_saket_must_be_false;

\echo ''
\echo '=== the cutoff, from both sides ==='

select set_radius('a0000000-0000-0000-0000-00000000000a', 25000);
select
  sees('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c')
    as at_25km_sees_23_5km_must_be_true,
  sees('a0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000d')
    as at_25km_sees_25_9km_must_be_false;

\echo ''
\echo '=== mutual range: both have to agree ==='

\echo '-- 87.7 km apart, both at 100 km'
select set_radius('a0000000-0000-0000-0000-00000000000a', 100000);
select
  sees('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002')
    as both_at_100km_must_be_true,
  sees('20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a')
    as and_the_other_way_must_be_true;

\echo '-- the same pair, but one of them chose 50 km'
select set_radius('20000000-0000-0000-0000-000000000002', 50000);
select
  sees('a0000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002')
    as wide_viewer_narrow_candidate_must_be_false,
  sees('20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a')
    as narrow_viewer_wide_candidate_must_be_false;
select set_radius('20000000-0000-0000-0000-000000000002', 100000);

\echo ''
\echo '=== across city, district and state lines ==='

select set_radius('a0000000-0000-0000-0000-00000000000a', 50000);
select
  sees('a0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-00000000000f')
    as delhi_sees_gurugram_haryana_must_be_true;

select set_radius('a0000000-0000-0000-0000-00000000000a', 75000);
select
  sees('a0000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001')
    as delhi_sees_meerut_up_must_be_true;

select set_radius('a0000000-0000-0000-0000-00000000000a', 150000);
select
  sees('a0000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000003')
    as at_150km_sees_119km_must_be_true,
  sees('a0000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000004')
    as at_150km_sees_178km_must_be_false;

\echo ''
\echo '=== existing eligibility rules still apply at 150 km ==='

\echo '-- a hidden profile drops out'
update profiles set is_discoverable = false
  where id = 'f0000000-0000-0000-0000-00000000000f';
select sees('a0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-00000000000f')
  as hidden_must_be_false;
update profiles set is_discoverable = true
  where id = 'f0000000-0000-0000-0000-00000000000f';

\echo '-- a block drops out, in whichever direction it was made'
insert into blocks (blocker_id, blocked_id)
  values ('a0000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001');
select
  sees('a0000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001')
    as blocker_sees_blocked_must_be_false,
  sees('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a')
    as blocked_sees_blocker_must_be_false;
delete from blocks where blocker_id = 'a0000000-0000-0000-0000-00000000000a';

\echo '-- a soft-deleted profile drops out'
update profiles set deleted_at = now()
  where id = 'c0000000-0000-0000-0000-00000000000c';
select sees('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c')
  as deleted_must_be_false;
update profiles set deleted_at = null, is_discoverable = true
  where id = 'c0000000-0000-0000-0000-00000000000c';

\echo '-- someone already swiped on drops out'
insert into swipes (actor_id, target_id, decision)
  values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'pass');
select sees('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b')
  as already_swiped_must_be_false;
delete from swipes where actor_id = 'a0000000-0000-0000-0000-00000000000a';

\echo ''
\echo '=== no location, and no radius chosen ==='

\echo '-- a member with a radius but no location gets nothing, and is told why'
select feed_size('00000000-0000-0000-0000-0000000000aa') as no_location_feed_must_be_0;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000aa';
select has_location as no_location_must_be_false, radius_m is not null as radius_chosen_must_be_true
  from discovery_status();
reset role;

\echo '-- the legacy member, with a location but no radius chosen, also gets nothing'
update profiles_private set
  geo = extensions.st_setsrid(extensions.st_makepoint(77.23, 28.64), 4326)::extensions.geography
  where id = '00000000-0000-0000-0000-0000000000bb';
select feed_size('00000000-0000-0000-0000-0000000000bb') as unset_radius_feed_must_be_0;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000bb';
select has_location as legacy_has_location_must_be_true, radius_m is null as legacy_radius_must_be_unset
  from discovery_status();
reset role;

\echo ''
\echo '=== what the client is allowed to see ==='

\echo '-- the response carries a label and no geography, distance or rank'
-- Read the OUT columns from pg_proc. information_schema.columns describes
-- tables, not set-returning functions, so asking it about discover_feed
-- returns nothing at all and a count of leaks would be 0 for the wrong
-- reason.
with out_cols as (
  select unnest(p.proargnames) as col, unnest(p.proargmodes) as mode
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'discover_feed'
)
select
  count(*) filter (where mode = 't') as out_columns_must_be_12,
  count(*) filter (
    where mode = 't'
      and (col ~* 'geo|dist|band|rank|zone|lat|lon|coord|point|metre|meter')
  ) as leaky_columns_must_be_0
from out_cols;

with out_cols as (
  select unnest(p.proargnames) as col, unnest(p.proargmodes) as mode
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'discover_feed'
)
select string_agg(col, ',') as feed_out_columns from out_cols where mode = 't';

\echo '-- the caller cannot pass a radius any more: only lim and page_offset'
select count(*) as radius_argument_must_be_0
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'discover_feed'
  and 'max_distance_m' = any(p.proargnames);

select array_to_string(p.proargnames, ',') as feed_arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'discover_feed';

\echo '-- the closest band reads Nearby; further away shows the city they published'
select set_radius('a0000000-0000-0000-0000-00000000000a', 150000);
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-00000000000a';
select
  (select f.proximity from discover_feed(50, 0) f
     where f.id = 'b0000000-0000-0000-0000-00000000000b') as label_for_5km_must_be_Nearby,
  (select f.proximity from discover_feed(50, 0) f
     where f.id = '30000000-0000-0000-0000-000000000003') as label_for_119km_must_be_Karnal;
reset role;

\echo ''
\echo '=== ranking and pagination ==='

\echo '-- nearest band first'
set role authenticated;
set test.uid = 'a0000000-0000-0000-0000-00000000000a';
select string_agg(f.name, ' < ') as order_nearest_band_first from discover_feed(50, 0) f;

\echo '-- paging the same ordering does not drop or repeat anybody'
with page1 as (select id from discover_feed(3, 0)),
     page2 as (select id from discover_feed(3, 3)),
     whole as (select id from discover_feed(50, 0))
select
  (select count(*) from page1) as page1_must_be_3,
  (select count(*) from page2) as page2_must_be_3,
  (select count(*) from (select id from page1 intersect select id from page2) x)
    as overlap_must_be_0,
  (select count(*) from (
     select id from page1 union select id from page2
     except select id from (select id from whole limit 6) w) y)
    as pages_match_whole_must_be_0;
reset role;
