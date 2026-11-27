#!/usr/bin/env bash
# Runs the proximity tests against a throwaway PostgreSQL cluster WITH REAL
# POSTGIS.
#
# run.sh stubs geography out, because what it tests is privileges and triggers
# and a stub costs it nothing. Proximity is the opposite: `st_dwithin` replaced
# by `true` would make every cutoff, cross-border and unequal-radius assertion
# pass without measuring anything. So this runner keeps the geography real and
# refuses to run rather than pretend.
#
#   apt-get install -y postgresql-16-postgis-3
#   supabase/tests/run_proximity.sh
set -euo pipefail

BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
HERE=$(cd "$(dirname "$0")" && pwd)

if ! ls /usr/share/postgresql/*/extension/postgis.control >/dev/null 2>&1; then
  echo "SKIPPED: PostGIS is not installed, and these tests are meaningless without it."
  echo "         apt-get install -y postgresql-16-postgis-3"
  exit 0
fi

DIR=$(mktemp -d)
PORT=${PGPORT:-5441}

cleanup() { "$BIN/pg_ctl" -D "$DIR/data" -w stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

"$BIN/initdb" -D "$DIR/data" -U postgres >/dev/null
"$BIN/pg_ctl" -D "$DIR/data" -l "$DIR/log" -o "-k $DIR -p $PORT -c listen_addresses=" -w start >/dev/null
psql -h "$DIR" -p "$PORT" -U postgres -qc 'create database nm' >/dev/null

# Supabase puts the extensions schema on the search path, which is why 0003
# can say `geography(point, 4326)` without qualifying it. Mirror that here
# rather than editing the migration to suit the test.
psql -h "$DIR" -p "$PORT" -U postgres -qc \
  'alter database nm set search_path = public, extensions' >/dev/null

# Stand in for what Supabase provides, minus anything geographic.
psql -h "$DIR" -p "$PORT" -U postgres -d nm -q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema if not exists auth;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated;
create table auth.users (id uuid primary key default gen_random_uuid(),
  raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select current_setting('test.uid', true)::uuid $$;
grant execute on function auth.uid() to anon, authenticated;

create schema if not exists storage;
grant usage on schema storage to anon, authenticated;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $fn$ select string_to_array(name, '/') $fn$;

create schema if not exists net;
create table net._calls (id bigserial primary key, url text, body jsonb);
create or replace function net.http_post(
  url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language sql as $fn$
    insert into net._calls (url, body) values (url, body) returning id;
  $fn$;
SQL

# The only rewrites: realtime is Supabase-only, and pg_net is stubbed above.
# Geography, the GiST index, st_dwithin and st_distance are all left alone.
keep_geo() {
  sed -e 's/alter publication supabase_realtime add table messages;/-- realtime is Supabase-only/' \
      -e 's/create extension if not exists pg_net with schema extensions;/-- pg_net is stubbed above/' \
      "$1"
}

for m in "$HERE"/../migrations/0[0-9][0-9][0-9]_*.sql; do
  keep_geo "$m" > "$DIR/$(basename "$m")"
  psql -h "$DIR" -p "$PORT" -U postgres -d nm -v ON_ERROR_STOP=1 -q -f "$DIR/$(basename "$m")"
  echo "$(basename "$m") applied"
done

# No ON_ERROR_STOP here: several assertions are negative and expect the
# statement to be refused. The migrations above do stop on error.
psql -h "$DIR" -p "$PORT" -U postgres -d nm -f "$HERE/proximity_test.sql"
