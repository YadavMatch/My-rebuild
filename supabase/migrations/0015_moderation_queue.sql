-- ---------------------------------------------------------------------------
-- Making a report reachable.
--
-- `reports` has had `status`, `reviewed_by` and `reviewed_at` since 0001, and
-- nothing has ever read or written them. 0001 revoked update and delete from
-- `authenticated`, correctly — a reporter must not be able to close their own
-- report, and the reported person must not be able to close it either — which
-- left `service_role` as the only writer and no function for it to call. So
-- reports accumulated in a table nobody queried. The product spec has said
-- "moderation queue to receive it" against both report features all along.
--
-- Three functions, all reachable only by `service_role`, which lives on a
-- server and never in the app:
--
--   moderation_queue(lim)      what is waiting, oldest first
--   claim_report(id, who)      mark it as being looked at
--   resolve_report(id, ...)    record the decision
--
-- Oldest first on purpose. A queue that shows the newest first quietly
-- abandons the reports nobody got to, which for safety reports is the worst
-- failure mode available.
--
-- `claim_report` only moves a report out of `open`, so two moderators opening
-- the queue together cannot both claim one: the second gets no row back and
-- knows to move on. `resolve_report` accepts only `actioned` or `dismissed`,
-- so the enum cannot be walked backwards into `open` and reopened silently.
--
-- WHAT THIS DOES NOT DO, stated plainly because the spec's claim depends on
-- it: nothing here is a human. It makes the queue queryable and actionable by
-- something holding the service key. There is no moderator UI, no assignment,
-- no SLA, no notification when a report arrives, and resolving a report as
-- `actioned` records a decision without hiding anyone or suspending anything
-- — what an action should do to an account is a policy question, not a schema
-- one. Until a person is actually working this queue, "real moderation" is
-- still not a true claim about the app.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

begin;

-- The queue is read by status and ordered by age, so index exactly that.
-- Partial, because `actioned` and `dismissed` rows are history and the queue
-- never asks for them.
create index if not exists reports_open_queue_idx
  on reports (created_at)
  where status in ('open', 'reviewing');

-- ------------------------------------------------------------------ reading

create or replace function moderation_queue(lim int default 50)
returns table (
  id            uuid,
  status        report_status,
  context       report_context,
  reason        text,
  created_at    timestamptz,
  reporter_id   uuid,
  reported_id   uuid,
  match_id      uuid,
  message_id    uuid,
  reviewed_by   uuid,
  -- Enough to judge without opening another query: has this person been
  -- reported before, and are they still visible to members?
  reported_times        bigint,
  reported_is_visible   boolean
)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select
    r.id, r.status, r.context, r.reason, r.created_at,
    r.reporter_id, r.reported_id, r.match_id, r.message_id, r.reviewed_by,
    (select count(*) from reports prior where prior.reported_id = r.reported_id),
    coalesce((
      select p.deleted_at is null and p.is_discoverable
      from profiles p where p.id = r.reported_id
    ), false)
  from reports r
  where r.status in ('open', 'reviewing')
  order by r.created_at
  limit least(greatest(coalesce(lim, 50), 1), 200);
$$;

-- ------------------------------------------------------------------ writing

-- Returns the row it claimed, or nothing if somebody else got there first.
create or replace function claim_report(target uuid, moderator uuid)
returns table (id uuid, status report_status)
language sql volatile security definer
set search_path = public, pg_catalog
as $$
  update reports
     set status = 'reviewing', reviewed_by = moderator
   where reports.id = target
     and reports.status = 'open'
  returning reports.id, reports.status;
$$;

create or replace function resolve_report(
  target    uuid,
  outcome   report_status,
  moderator uuid default null
)
returns table (id uuid, status report_status)
language plpgsql volatile security definer
set search_path = public, pg_catalog
as $$
begin
  if outcome not in ('actioned', 'dismissed') then
    raise exception 'resolve_report_invalid_outcome' using errcode = 'P0001';
  end if;

  return query
    update reports
       set status = outcome,
           reviewed_at = now(),
           reviewed_by = coalesce(moderator, reports.reviewed_by)
     where reports.id = target
       and reports.status in ('open', 'reviewing')
    returning reports.id, reports.status;
end;
$$;

-- Only a server may work the queue. Supabase grants execute on public
-- functions to anon and authenticated as they are created, so these have to
-- be taken back explicitly rather than merely not granted.
revoke execute on function moderation_queue(int)                    from public, anon, authenticated;
revoke execute on function claim_report(uuid, uuid)                 from public, anon, authenticated;
revoke execute on function resolve_report(uuid, report_status, uuid) from public, anon, authenticated;

grant execute on function moderation_queue(int)                     to service_role;
grant execute on function claim_report(uuid, uuid)                  to service_role;
grant execute on function resolve_report(uuid, report_status, uuid)  to service_role;

commit;
