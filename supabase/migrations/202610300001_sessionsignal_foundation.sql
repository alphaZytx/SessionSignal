-- SessionSignal managed-backend foundation.
-- Apply with the Supabase CLI or SQL editor using a database-owner connection.
-- Browser and extension clients must use only the publishable key; all access is
-- constrained by the RLS policies and SECURITY DEFINER functions below.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'unassigned' check (role in ('unassigned', 'teacher')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Trusted application roles. Teacher role is provisioned administratively, never by a browser form.';

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  session_code text not null unique check (session_code ~ '^[A-Z0-9]{6}$'),
  status text not null default 'active' check (status in ('active', 'ended', 'cancelled')),
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  is_demo boolean not null default false,
  source text not null default 'sessionsignal' check (source in ('sessionsignal', 'legacy_sqlite', 'development_demo')),
  legacy_source_id text,
  retention_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint sessions_end_state check (
    (status = 'active' and ended_at is null)
    or (status <> 'active' and ended_at is not null)
  )
);

create index if not exists sessions_teacher_created_idx
  on public.sessions (teacher_id, created_at desc);
create index if not exists sessions_teacher_status_idx
  on public.sessions (teacher_id, status);
create unique index if not exists sessions_legacy_source_idx
  on public.sessions (legacy_source_id)
  where legacy_source_id is not null;

create table if not exists public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  status text not null default 'connected' check (
    status in ('connected', 'reconnecting', 'stale', 'disconnected', 'camera_unavailable', 'stopped', 'session_ended')
  ),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  stopped_at timestamptz,
  source text not null default 'sessionsignal' check (source in ('sessionsignal', 'legacy_sqlite', 'development_demo')),
  legacy_source_id text,
  metadata jsonb not null default '{}'::jsonb,
  unique (session_id, auth_user_id)
);

create index if not exists participants_session_seen_idx
  on public.session_participants (session_id, last_seen_at desc);
create index if not exists participants_auth_user_idx
  on public.session_participants (auth_user_id);
create unique index if not exists participants_legacy_source_idx
  on public.session_participants (legacy_source_id)
  where legacy_source_id is not null;

create table if not exists public.student_snapshots (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  participant_id uuid not null references public.session_participants(id) on delete cascade,
  student_auth_user_id uuid references auth.users(id) on delete set null,
  student_display_name text not null check (char_length(student_display_name) between 1 and 80),
  captured_at timestamptz not null,
  interval_started_at timestamptz,
  interval_ended_at timestamptz,
  interval_duration_ms integer not null default 0 check (interval_duration_ms between 0 and 120000),
  payload_version text not null default '1.0' check (char_length(payload_version) between 1 and 20),
  signal_state text not null default 'observable' check (signal_state in ('observable', 'unavailable')),

  attention_score double precision check (attention_score between 0 and 100),
  attention_category text,
  attention_trend text,
  interval_attention_score double precision check (interval_attention_score between 0 and 100),

  gaze_on_screen_pct double precision check (gaze_on_screen_pct between 0 and 100),
  gaze_deviation_mean double precision,
  gaze_deviation_max double precision,
  gaze_x double precision,
  gaze_y double precision,

  head_pose_pitch_mean double precision,
  head_pose_yaw_mean double precision,
  head_pose_roll_mean double precision,
  head_pose_pitch_std double precision,
  head_pose_yaw_std double precision,
  head_pose_category text,

  eye_openness_left_mean double precision check (eye_openness_left_mean between 0 and 1),
  eye_openness_left_min double precision check (eye_openness_left_min between 0 and 1),
  eye_openness_right_mean double precision check (eye_openness_right_mean between 0 and 1),
  eye_openness_right_min double precision check (eye_openness_right_min between 0 and 1),
  eyes_closed_pct double precision check (eyes_closed_pct between 0 and 100),
  blink_rate double precision check (blink_rate between 0 and 120),

  mouth_openness_mean double precision check (mouth_openness_mean between 0 and 1),
  yawn_detected boolean not null default false,
  drowsiness_score double precision check (drowsiness_score between 0 and 1),
  primary_emotion text,
  emotion_distribution jsonb not null default '{}'::jsonb,
  face_detected_pct double precision check (face_detected_pct between 0 and 100),
  alert_flags text[] not null default '{}'::text[],
  frame_count integer not null default 0 check (frame_count between 0 and 10000),
  metrics jsonb not null,
  source text not null default 'sessionsignal' check (source in ('sessionsignal', 'legacy_sqlite', 'development_demo')),
  legacy_source_id text,
  created_at timestamptz not null default now(),

  constraint snapshot_interval_order check (
    interval_started_at is null or interval_ended_at is null or interval_started_at <= interval_ended_at
  ),
  constraint snapshot_metrics_object check (jsonb_typeof(metrics) = 'object'),
  constraint snapshot_unavailable_has_no_score check (
    signal_state = 'observable'
    or (attention_score is null and interval_attention_score is null)
  )
);

create index if not exists snapshots_session_participant_time_idx
  on public.student_snapshots (session_id, participant_id, captured_at);
create index if not exists snapshots_session_time_idx
  on public.student_snapshots (session_id, captured_at);
create unique index if not exists snapshots_legacy_source_idx
  on public.student_snapshots (legacy_source_id)
  where legacy_source_id is not null;

-- Join-attempt records support a modest per-auth-identity database rate limit.
-- Supabase Anonymous Auth CAPTCHA/Turnstile and platform rate limits remain required
-- for public deployment because the database cannot reliably rate-limit by client IP.
create table if not exists public.session_join_attempts (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  was_successful boolean not null default false
);
create index if not exists join_attempts_user_time_idx
  on public.session_join_attempts (auth_user_id, attempted_at desc);

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.student_snapshots enable row level security;
alter table public.session_join_attempts enable row level security;

create or replace function public.is_teacher(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = check_user_id and p.role = 'teacher'
  );
$$;

revoke all on function public.is_teacher(uuid) from public;
grant execute on function public.is_teacher(uuid) to authenticated;

create policy profiles_teacher_read_own
on public.profiles for select to authenticated
using (id = (select auth.uid()) and public.is_teacher((select auth.uid())));

create policy sessions_teacher_select_own
on public.sessions for select to authenticated
using (teacher_id = (select auth.uid()) and public.is_teacher((select auth.uid())));

create policy participants_teacher_select_owned
on public.session_participants for select to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_participants.session_id
      and s.teacher_id = (select auth.uid())
      and public.is_teacher((select auth.uid()))
  )
);

create policy participants_student_select_own
on public.session_participants for select to authenticated
using (
  auth_user_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy snapshots_teacher_select_owned
on public.student_snapshots for select to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = student_snapshots.session_id
      and s.teacher_id = (select auth.uid())
      and public.is_teacher((select auth.uid()))
  )
);

-- No direct INSERT/UPDATE/DELETE policy is intentionally defined for application
-- tables. Mutations happen through the validated functions below.

create or replace function public.random_session_code()
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea := extensions.gen_random_bytes(6);
  result text := '';
  index_value integer;
begin
  for index_value in 0..5 loop
    result := result || substr(alphabet, (get_byte(random_bytes, index_value) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

revoke all on function public.random_session_code() from public;

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
    raise exception 'Teacher authorization required' using errcode = '42501';
  end if;

  -- Serialise start requests per facilitator and reuse an already-active
  -- session. This makes double-clicks and concurrent browser tabs idempotent.
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

create or replace function public.get_session_latest_snapshots(p_session_id uuid)
returns setof public.student_snapshots
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.sessions s
    where s.id = p_session_id
      and s.teacher_id = (select auth.uid())
      and public.is_teacher((select auth.uid()))
  ) then
    raise exception 'Owned session not found' using errcode = '42501';
  end if;

  return query
  select distinct on (ss.participant_id) ss.*
  from public.student_snapshots ss
  where ss.session_id = p_session_id
  order by ss.participant_id, ss.captured_at desc;
end;
$$;

revoke all on function public.get_session_latest_snapshots(uuid) from public;
grant execute on function public.get_session_latest_snapshots(uuid) to authenticated;

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
  on conflict (session_id, auth_user_id) do update set
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

create or replace function public.submit_student_snapshot(
  p_snapshot_id uuid,
  p_session_id uuid,
  p_participant_id uuid,
  p_captured_at timestamptz,
  p_interval_started_at timestamptz,
  p_interval_ended_at timestamptz,
  p_payload_version text,
  p_signal_state text,
  p_metrics jsonb
)
returns table (snapshot_id uuid, accepted boolean, session_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  participant_row public.session_participants%rowtype;
  session_row public.sessions%rowtype;
  inserted_id uuid;
  interval_ms integer;
  score double precision;
  interval_score double precision;
begin
  if (select auth.uid()) is null
     or not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'Anonymous student authentication required' using errcode = '42501';
  end if;
  if p_metrics is null or jsonb_typeof(p_metrics) <> 'object'
     or octet_length(p_metrics::text) > 32768 then
    raise exception 'Invalid or oversized metrics payload' using errcode = '22023';
  end if;
  if p_payload_version <> '1.0' then
    raise exception 'Unsupported payload version' using errcode = '22023';
  end if;
  if p_signal_state not in ('observable', 'unavailable') then
    raise exception 'Invalid signal state' using errcode = '22023';
  end if;
  if coalesce(p_metrics #>> '{modes,emotion}', 'neutral') not in
       ('focused', 'confused', 'bored', 'engaged', 'distracted', 'drowsy', 'neutral')
     or coalesce(p_metrics #>> '{modes,headPoseCategory}', 'forward') not in
       ('forward', 'looking_down', 'looking_left', 'looking_right', 'tilted', 'looking_up')
     or coalesce(p_metrics #>> '{modes,attentionCategory}', 'neutral') not in
       ('highly_focused', 'focused', 'neutral', 'distracted', 'disengaged', 'unavailable') then
    raise exception 'Unsupported categorical metric' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(coalesce(p_metrics #> '{computed,alertFlags}', '[]'::jsonb)) flag
    where flag not in ('GAZE_OFF', 'HEAD_TURNED', 'DROWSY', 'YAWNING', 'HIGH_DISTRACTION', 'LOW_BLINK', 'EYES_CLOSED')
  ) then
    raise exception 'Unsupported alert flag' using errcode = '22023';
  end if;
  if p_captured_at > now() + interval '2 minutes'
     or p_captured_at < now() - interval '24 hours' then
    raise exception 'Snapshot timestamp outside accepted window' using errcode = '22023';
  end if;

  select * into participant_row
  from public.session_participants p
  where p.id = p_participant_id
    and p.session_id = p_session_id
    and p.auth_user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Participant ownership mismatch' using errcode = '42501';
  end if;

  select * into session_row
  from public.sessions s where s.id = p_session_id for update;
  if not found or session_row.status <> 'active' then
    raise exception 'Session has ended' using errcode = 'P0003';
  end if;

  -- Idempotent retries of the same UUID remain valid, while a compromised client
  -- cannot turn the five-second telemetry endpoint into a high-rate write path.
  if not exists (
    select 1 from public.student_snapshots existing
    where existing.id = p_snapshot_id
      and existing.participant_id = p_participant_id
  ) and exists (
    select 1 from public.student_snapshots recent
    where recent.participant_id = p_participant_id
      and recent.created_at > now() - interval '1 second'
  ) then
    raise exception 'Telemetry submitted too frequently' using errcode = 'P0001';
  end if;

  interval_ms := greatest(0, least(120000,
    coalesce((p_metrics #>> '{timing,intervalDurationMs}')::integer, 0)
  ));
  score := nullif(p_metrics #>> '{attentionScore,mean}', '')::double precision;
  interval_score := nullif(p_metrics #>> '{computed,intervalAttentionScore}', '')::double precision;

  if p_signal_state = 'unavailable' then
    score := null;
    interval_score := null;
  elsif score is null or interval_score is null
        or score < 0 or score > 100 or interval_score < 0 or interval_score > 100 then
    raise exception 'Observable snapshots require attention scores between 0 and 100' using errcode = '22023';
  end if;

  insert into public.student_snapshots (
    id, session_id, participant_id, student_auth_user_id, student_display_name,
    captured_at, interval_started_at, interval_ended_at, interval_duration_ms,
    payload_version, signal_state,
    attention_score, attention_category, attention_trend, interval_attention_score,
    gaze_on_screen_pct, gaze_deviation_mean, gaze_deviation_max, gaze_x, gaze_y,
    head_pose_pitch_mean, head_pose_yaw_mean, head_pose_roll_mean,
    head_pose_pitch_std, head_pose_yaw_std, head_pose_category,
    eye_openness_left_mean, eye_openness_left_min, eye_openness_right_mean,
    eye_openness_right_min, eyes_closed_pct, blink_rate,
    mouth_openness_mean, yawn_detected, drowsiness_score, primary_emotion,
    emotion_distribution, face_detected_pct, alert_flags, frame_count, metrics
  ) values (
    p_snapshot_id, p_session_id, p_participant_id, (select auth.uid()), participant_row.display_name,
    p_captured_at, p_interval_started_at, p_interval_ended_at, interval_ms,
    p_payload_version, p_signal_state,
    score,
    nullif(p_metrics #>> '{modes,attentionCategory}', ''),
    nullif(p_metrics #>> '{computed,attentionTrend}', ''),
    interval_score,
    nullif(p_metrics #>> '{percentages,gazeOnScreen}', '')::double precision,
    nullif(p_metrics #>> '{gazeDeviation,mean}', '')::double precision,
    nullif(p_metrics #>> '{gazeDeviation,max}', '')::double precision,
    nullif(p_metrics #>> '{gazeX,mean}', '')::double precision,
    nullif(p_metrics #>> '{gazeY,mean}', '')::double precision,
    nullif(p_metrics #>> '{headPosePitch,mean}', '')::double precision,
    nullif(p_metrics #>> '{headPoseYaw,mean}', '')::double precision,
    nullif(p_metrics #>> '{headPoseRoll,mean}', '')::double precision,
    nullif(p_metrics #>> '{headPosePitch,stdDev}', '')::double precision,
    nullif(p_metrics #>> '{headPoseYaw,stdDev}', '')::double precision,
    nullif(p_metrics #>> '{modes,headPoseCategory}', ''),
    nullif(p_metrics #>> '{eyeOpennessLeft,mean}', '')::double precision,
    nullif(p_metrics #>> '{eyeOpennessLeft,min}', '')::double precision,
    nullif(p_metrics #>> '{eyeOpennessRight,mean}', '')::double precision,
    nullif(p_metrics #>> '{eyeOpennessRight,min}', '')::double precision,
    nullif(p_metrics #>> '{percentages,eyesClosed}', '')::double precision,
    nullif(p_metrics #>> '{blinkRate,mean}', '')::double precision,
    nullif(p_metrics #>> '{mouthOpenness,mean}', '')::double precision,
    coalesce((p_metrics #>> '{eventFlags,yawnDetected}')::boolean, false),
    nullif(p_metrics #>> '{drowsinessScore,mean}', '')::double precision,
    nullif(p_metrics #>> '{modes,emotion}', ''),
    coalesce(p_metrics -> 'emotionDistribution', '{}'::jsonb),
    nullif(p_metrics #>> '{percentages,faceDetected}', '')::double precision,
    coalesce(array(select jsonb_array_elements_text(p_metrics #> '{computed,alertFlags}')), '{}'::text[]),
    coalesce((p_metrics #>> '{timing,frameCount}')::integer, 0),
    p_metrics
  )
  on conflict (id) do nothing
  returning id into inserted_id;

  update public.session_participants
  set last_seen_at = now(), status = 'connected', stopped_at = null
  where id = p_participant_id;

  return query select p_snapshot_id, inserted_id is not null, session_row.status;
end;
$$;

revoke all on function public.submit_student_snapshot(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, text, text, jsonb) from public;
grant execute on function public.submit_student_snapshot(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, text, text, jsonb) to authenticated;

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

create or replace function public.end_class_session(p_session_id uuid)
returns table (session_id uuid, status text, ended_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended_session public.sessions%rowtype;
  participant_record record;
begin
  if not public.is_teacher((select auth.uid())) then
    raise exception 'Teacher authorization required' using errcode = '42501';
  end if;

  update public.sessions s
  set status = 'ended', ended_at = coalesce(s.ended_at, now())
  where s.id = p_session_id
    and s.teacher_id = (select auth.uid())
    and s.status = 'active'
  returning * into ended_session;
  if not found then
    raise exception 'Active owned session not found' using errcode = 'P0002';
  end if;

  update public.session_participants
  set status = 'session_ended', last_seen_at = now(), stopped_at = coalesce(stopped_at, now())
  where session_participants.session_id = p_session_id;

  for participant_record in
    select p.auth_user_id from public.session_participants p where p.session_id = p_session_id
  loop
    perform realtime.send(
      jsonb_build_object('sessionId', p_session_id, 'status', 'ended', 'endedAt', ended_session.ended_at),
      'session_ended',
      'sessionsignal:student-session:' || p_session_id::text || ':' || participant_record.auth_user_id::text,
      true
    );
  end loop;

  perform realtime.send(
    jsonb_build_object('sessionId', p_session_id, 'status', 'ended', 'endedAt', ended_session.ended_at),
    'session_ended',
    'sessionsignal:teacher-session:' || p_session_id::text,
    true
  );

  return query select ended_session.id, ended_session.status, ended_session.ended_at;
end;
$$;

revoke all on function public.end_class_session(uuid) from public;
grant execute on function public.end_class_session(uuid) to authenticated;

create or replace function public.broadcast_snapshot_to_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'snapshotId', new.id,
      'sessionId', new.session_id,
      'participantId', new.participant_id,
      'name', new.student_display_name,
      'capturedAt', new.captured_at,
      'payloadVersion', new.payload_version,
      'signalState', new.signal_state,
      'metrics', new.metrics
    ),
    'snapshot_inserted',
    'sessionsignal:teacher-session:' || new.session_id::text,
    true
  );
  return null;
end;
$$;

drop trigger if exists student_snapshot_broadcast_trigger on public.student_snapshots;
create trigger student_snapshot_broadcast_trigger
after insert on public.student_snapshots
for each row execute function public.broadcast_snapshot_to_teacher();

-- Realtime Authorization: only an owning teacher can read a teacher topic, and
-- only an actual participant can read their own session-lifecycle topic.
-- No client INSERT policy is defined, so application clients cannot publish fake
-- metrics directly to private channels.
create policy sessionsignal_private_broadcast_receive
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (
    exists (
      select 1 from public.sessions s
      where s.teacher_id = (select auth.uid())
        and public.is_teacher((select auth.uid()))
        and (select realtime.topic()) = 'sessionsignal:teacher-session:' || s.id::text
    )
    or exists (
      select 1 from public.session_participants p
      where p.auth_user_id = (select auth.uid())
        and (select realtime.topic()) =
          'sessionsignal:student-session:' || p.session_id::text || ':' || p.auth_user_id::text
    )
  )
);

-- Remove expired telemetry through a scheduled, owner-controlled call. This is
-- deliberately not granted to client roles. Configure pg_cron or an external
-- scheduled database task only after the project owner confirms retention rules.
create or replace function public.delete_expired_sessionsignal_data()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from public.student_snapshots ss
  using public.sessions s
  where ss.session_id = s.id
    and s.retention_until is not null
    and s.retention_until < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_expired_sessionsignal_data() from public;

grant usage on schema public to authenticated;
grant select on public.profiles, public.sessions, public.session_participants, public.student_snapshots to authenticated;

comment on table public.student_snapshots is
  'Five-second derived numerical telemetry only. Raw camera frames, images, video, audio, screenshots, and face embeddings are prohibited.';
comment on function public.join_class_session(text, text) is
  'Restricted code lookup and participant reconnect path for authenticated anonymous extension users.';
comment on function public.submit_student_snapshot(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, text, text, jsonb) is
  'Validated idempotent numerical telemetry insert. Does not accept raw media.';
