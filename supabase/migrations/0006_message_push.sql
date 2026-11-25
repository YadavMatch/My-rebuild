-- ---------------------------------------------------------------------------
-- Push a notification when a message arrives.
--
-- Sent from the database rather than from the sender's app. The alternative
-- would be the sender POSTing to Expo directly, which means the sender's
-- client has to be able to read the recipient's push token — and a leaked
-- push token lets anyone send notifications to that device. Tokens stay
-- server-side, where push_tokens' row-level security already keeps them.
--
-- pg_net makes the call without blocking the insert: the message is
-- committed whether or not Expo answers.
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pg_net with schema extensions;

create or replace function notify_on_message()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  recipient uuid;
  sender_name text;
  payload jsonb;
begin
  -- The other half of the match.
  select case when m.user_a = new.sender_id then m.user_b else m.user_a end
    into recipient
    from matches m
   where m.id = new.match_id;

  if recipient is null then
    return new;
  end if;

  -- Someone who blocked you does not get told you wrote to them.
  if is_blocked(recipient, new.sender_id) then
    return new;
  end if;

  select name into sender_name from profiles where id = new.sender_id;

  -- One Expo message per registered device, in a single request.
  select jsonb_agg(
           jsonb_build_object(
             'to', t.token,
             'title', coalesce(sender_name, 'New message'),
             -- The preview is deliberately short: a lock screen is read by
             -- whoever is holding the phone, not only its owner.
             'body', left(new.body, 120),
             'sound', 'default',
             'data', jsonb_build_object('url', '/chat/' || new.match_id)
           )
         )
    into payload
    from push_tokens t
   where t.user_id = recipient;

  if payload is null then
    return new;
  end if;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    body    := payload,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Accept', 'application/json'
               )
  );

  return new;
end;
$$;

drop trigger if exists messages_notify on messages;
create trigger messages_notify
  after insert on messages
  for each row execute function notify_on_message();

commit;
