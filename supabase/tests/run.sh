#!/usr/bin/env bash
# Runs the schema tests against a throwaway PostgreSQL cluster.
#
# PostGIS is not required: the two calls that need it are stubbed, since the
# properties under test are about privileges and triggers, not geometry.
set -euo pipefail

BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
DIR=$(mktemp -d)
PORT=${PGPORT:-5439}
HERE=$(cd "$(dirname "$0")" && pwd)

cleanup() { "$BIN/pg_ctl" -D "$DIR/data" -w stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

"$BIN/initdb" -D "$DIR/data" -U postgres >/dev/null
"$BIN/pg_ctl" -D "$DIR/data" -l "$DIR/log" -o "-k $DIR -p $PORT -c listen_addresses=" -w start >/dev/null
psql -h "$DIR" -p "$PORT" -U postgres -qc 'create database nm' >/dev/null

# Stand in for what Supabase provides.
psql -h "$DIR" -p "$PORT" -U postgres -d nm -q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema if not exists auth;
grant usage on schema public, auth to anon, authenticated;
create table auth.users (id uuid primary key default gen_random_uuid(),
  raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select current_setting('test.uid', true)::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
SQL

sed -e 's/create extension if not exists postgis;/-- postgis stubbed/' \
    -e 's/geography(point, 4326)/text/' \
    -e 's/create index on profiles using gist (geo);/-- gist needs postgis/' \
    -e 's/st_dwithin(p.geo, me.geo, max_distance_m)/true/' \
    -e '/p.geo <-> me.geo,/d' \
    -e 's/alter publication supabase_realtime add table messages;/-- realtime is Supabase-only/' \
    "$HERE/../migrations/0001_initial_schema.sql" > "$DIR/migration.sql"

psql -h "$DIR" -p "$PORT" -U postgres -d nm -v ON_ERROR_STOP=1 -q -f "$DIR/migration.sql"
echo "migration applied"
psql -h "$DIR" -p "$PORT" -U postgres -d nm -f "$HERE/schema_test.sql"
