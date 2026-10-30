-- SessionSignal reliability hardening for databases that already applied the
-- foundation migration. Internal teacher/student identifiers remain unchanged
-- to preserve compatibility with existing profiles, snapshots, and reports.

create or replace function public.create_class_session()
returns table (session_id uuid, session_code text, started_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_code text;
  created_session public.sessions%rowtype;
  attempts integer := 0;
begin
  if (select auth.uid()) is null or not public.is_teacher((select auth.uid())) then
    raise exception 'Facilitator authorization required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended((select auth.uid())::text, 0)
  );
  select * into created_session
  from public.sessions s
  where s.teacher_id = (select auth.uid()) and s.status = 'active'
  order by s.started_at desc
  limit 1;
  if found then
    return query select created_session.id, created_session.session_code, created_session.started_at;
    return;
  end if;

  loop
    attempts := attempts + 1;
    generated_code := public.random_session_code();
    begin
      insert into public.sessions (teacher_id, session_code, retention_until)
      values ((select auth.uid()), generated_code, now() + interval '180 days')
      returning * into created_session;
      exit;
    exception when unique_violation then
      if attempts >= 10 then
        raise exception 'Unable to allocate a unique session code';
      end if;
    end;
  end loop;

  return query select created_session.id, created_session.session_code, created_session.started_at;
end;
$$;

revoke all on function public.create_class_session() from public;
grant execute on function public.create_class_session() to authenticated;

-- Successful reconnects are normal behavior and no longer consume the failed
-- code-guess allowance. Supabase platform rate limits and CAPTCHA remain part
-- of the public-deployment requirements.
create or replace function public.sessionsignal_recent_failed_joins(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.session_join_attempts a
  where a.auth_user_id = p_user_id
    and a.attempted_at > now() - interval '10 minutes'
    and not a.was_successful;
$$;

revoke all on function public.sessionsignal_recent_failed_joins(uuid) from public;

-- The original join function counts rows in this table. Removing successful
-- rows preserves its compatibility while ensuring ordinary reconnects do not
-- exhaust the ten-failure allowance.
delete from public.session_join_attempts where was_successful;
create or replace function public.sessionsignal_remove_successful_join_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.session_join_attempts where id = new.id;
  return null;
end;
$$;
drop trigger if exists remove_successful_join_attempt on public.session_join_attempts;
create trigger remove_successful_join_attempt
after update of was_successful on public.session_join_attempts
for each row
when (new.was_successful)
execute function public.sessionsignal_remove_successful_join_attempt();

create or replace function public.set_participant_status(
  p_participant_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  participant_row public.session_participants%rowtype;
begin
  if p_status not in ('connected', 'reconnecting', 'disconnected', 'camera_unavailable', 'stopped') then
    raise exception 'Unsupported participant status' using errcode = '22023';
  end if;

  update public.session_participants p
  set status = p_status,
      last_seen_at = now(),
      stopped_at = case when p_status in ('stopped', 'camera_unavailable') then now() else p.stopped_at end
  where p.id = p_participant_id
    and p.auth_user_id = (select auth.uid())
    and exists (
      select 1 from public.sessions s
      where s.id = p.session_id and s.status = 'active'
    )
  returning * into participant_row;
  if not found then
    raise exception 'Participant is unavailable or the session has ended' using errcode = '42501';
  end if;

  perform realtime.send(
    jsonb_build_object(
      'sessionId', participant_row.session_id,
      'participantId', participant_row.id,
      'name', participant_row.display_name,
      'status', participant_row.status,
      'lastSeenAt', participant_row.last_seen_at
    ),
    'participant_status',
    'sessionsignal:teacher-session:' || participant_row.session_id::text,
    true
  );
end;
$$;

revoke all on function public.set_participant_status(uuid, text) from public;
grant execute on function public.set_participant_status(uuid, text) to authenticated;
