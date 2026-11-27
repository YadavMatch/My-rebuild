-- NearMatch — verification attempts carry the provider's inquiry id
--
-- Why this exists: the verification webhook had no way to recognise a repeat
-- delivery. Persona retries a failed delivery up to seven more times with
-- exponential backoff, warns that duplicates happen and that deliveries are
-- not ordered — so without a key to match on, every retry inserted a second
-- attempt row for one check. The row count stopped meaning anything.
--
-- With this, the handler upserts on (provider, inquiry_id) and a retry is a
-- no-op.
--
-- Three choices worth explaining:
--
--   * Nullable, not `not null`. Rows written before this migration have no
--     inquiry id, and a `not null` column would either reject them or need a
--     made-up default. Postgres treats nulls as distinct in a unique index,
--     so those rows do not collide with each other.
--
--   * Unique on (provider, inquiry_id), not on inquiry_id alone. The table
--     stays provider-agnostic — `provider` is a free-text column precisely so
--     a second provider can coexist — and two providers are free to mint the
--     same id string without colliding here.
--
--   * No new grant. 0001 revoked insert, update and delete on this table from
--     `authenticated` at table level, so a new column is unreachable to a
--     client by default. The service role remains the only writer, which is
--     what makes the Verified badge mean anything.
--
-- Numbered 0008, not 0002, although it is only the second migration on this
-- branch. 0002 through 0007 live on claude/stoic-cerf-j3hy5o -- geo moved to
-- profiles_private, profile photos, message push, premium grants -- and were
-- applied to the live project before this one was. Numbering this 0002 would
-- have claimed it ran first, and would have collided with that branch's
-- 0002_hide_geo.sql on merge. The gap is deliberate and reserved.
--
-- Safe to run twice.

begin;

alter table verification_attempts
  add column if not exists inquiry_id text;

create unique index if not exists verification_attempts_provider_inquiry_key
  on verification_attempts (provider, inquiry_id);

comment on column verification_attempts.inquiry_id is
  'The provider''s id for this check (Persona: inq_...). Unique per provider '
  'so a retried webhook cannot record the same check twice. Null for rows '
  'written before this migration.';

commit;
