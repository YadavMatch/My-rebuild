-- ---------------------------------------------------------------------------
-- A server-side limit on sending messages.
--
-- The product spec lists "swipe and message rate limits" and only half of it
-- existed: likes are capped by a trigger, messages by nothing at all. A client
-- could send as fast as it could loop, and nothing in the database would
-- object. On a dating app that is the mechanism for harassment at volume, and
-- the kind of thing that is only ever noticed after it happens to someone.
--
-- Two limits, because they catch different behaviour:
--
--   * 20 messages a minute, all matches together. A human typing cannot reach
--     this; a loop reaches it immediately. This is the abuse limit.
--
--   * 60 messages an hour to ONE match. Deliberately generous — a lively
--     conversation runs well under it — but it caps a single person being
--     buried, which the per-minute limit alone does not: 19 a minute, forever,
--     would never trip it.
--
-- Both raise `message_rate_limit_reached`, and the client already knows how to
-- surface a named database error from the like cap.
--
-- Same advisory lock reasoning as 0013: count-then-check is not atomic under
-- READ COMMITTED, so two sends arriving together could both pass the check.
-- Keyed on the sender, so two members never wait for each other.
--
-- Not capped here: message length, which 0001 already constrains to 2000
-- characters, and who may send at all, which the `messages_send` policy
-- decides. This only limits rate.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

begin;

create or replace function enforce_message_rate_limit()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  per_minute      int;
  per_hour_to_one int;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('nearmatch:message:' || new.sender_id::text, 0)
  );

  select count(*) into per_minute
  from messages
  where sender_id = new.sender_id
    and created_at >= now() - interval '1 minute';

  if per_minute >= 20 then
    raise exception 'message_rate_limit_reached' using errcode = 'P0001';
  end if;

  select count(*) into per_hour_to_one
  from messages
  where sender_id = new.sender_id
    and match_id = new.match_id
    and created_at >= now() - interval '1 hour';

  if per_hour_to_one >= 60 then
    raise exception 'message_rate_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_rate_limit on messages;

create trigger messages_rate_limit
  before insert on messages
  for each row execute function enforce_message_rate_limit();

commit;
