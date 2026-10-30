-- The OUT parameter named session_id is visible as a PL/pgSQL variable. Use
-- the named unique constraint instead of an unqualified conflict column list
-- so anonymous participants can safely join or reconnect to a live session.
create or replace function public.join_class_session(p_session_code text, p_display_name text)
returns table (
  session_id uuid,
  participant_id uuid,
  session_status text,
  session_started_at timestamptz,
  participant_display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(trim(p_session_code));
  normalized_name text := trim(p_display_name);
  target_session public.sessions%rowtype;
  target_participant public.session_participants%rowtype;
  recent_attempts integer;
begin
  if (select auth.uid()) is null
     or not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'Anonymous student authentication required' using errcode = '42501';
  end if;

  if normalized_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'Session code must contain six letters or numbers' using errcode = '22023';
  end if;
  if char_length(normalized_name) < 1 or char_length(normalized_name) > 80 then
    raise exception 'Display name must be between 1 and 80 characters' using errcode = '22023';
  end if;

  select count(*) into recent_attempts
  from public.session_join_attempts a
  where a.auth_user_id = (select auth.uid())
    and a.attempted_at > now() - interval '10 minutes'
    and not a.was_successful;
  if recent_attempts >= 10 then
    raise exception 'Too many join attempts. Try again later.' using errcode = 'P0001';
  end if;

  insert into public.session_join_attempts (auth_user_id)
  values ((select auth.uid()));

  select * into target_session
  from public.sessions s
  where s.session_code = normalized_code and s.status = 'active'
  for update;

  if not found then
    raise exception 'Invalid or ended session code' using errcode = 'P0002';
  end if;

  insert into public.session_participants (
    session_id, auth_user_id, display_name, status, last_seen_at, stopped_at
  ) values (
    target_session.id, (select auth.uid()), normalized_name, 'connected', now(), null
  )
  on conflict on constraint session_participants_session_id_auth_user_id_key do update set
    display_name = excluded.display_name,
    status = 'connected',
    last_seen_at = now(),
    stopped_at = null
  returning * into target_participant;

  update public.session_join_attempts
  set was_successful = true
  where id = (
    select a.id from public.session_join_attempts a
    where a.auth_user_id = (select auth.uid())
    order by a.id desc limit 1
  );

  perform realtime.send(
    jsonb_build_object(
      'sessionId', target_session.id,
      'participantId', target_participant.id,
      'name', target_participant.display_name,
      'status', target_participant.status,
      'lastSeenAt', target_participant.last_seen_at
    ),
    'participant_joined',
    'sessionsignal:teacher-session:' || target_session.id::text,
    true
  );

  return query select
    target_session.id,
    target_participant.id,
    target_session.status,
    target_session.started_at,
    target_participant.display_name;
end;
$$;

revoke all on function public.join_class_session(text, text) from public;
grant execute on function public.join_class_session(text, text) to authenticated;
