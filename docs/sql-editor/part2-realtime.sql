-- ===========================================================================
-- Part 2 of 4: REALTIME DELIVERY  (fixes issue #20)
--
-- The app subscribes to postgres_changes on `messages`, but the table is not
-- in the supabase_realtime publication, so nothing is ever delivered. The
-- subscription succeeds and the insert succeeds, which is why this looked
-- like a client bug for so long.
--
-- Idempotent: safe to run twice, and it tells you which branch it took
-- instead of failing with "table is already member of publication".
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No supabase_realtime publication on this project. Enable Realtime for the messages table in the dashboard (Database -> Replication) instead of running this.';
  elsif exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='messages'
  ) then
    raise notice 'messages was already published for realtime. Nothing to do.';
  else
    alter publication supabase_realtime add table messages;
    raise notice 'messages is now published for realtime.';
  end if;
end;
$$;
