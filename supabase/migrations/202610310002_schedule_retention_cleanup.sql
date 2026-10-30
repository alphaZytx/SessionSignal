-- Enforce the documented 180-day telemetry retention period without any
-- browser credentials or client-side database access.
create extension if not exists pg_cron;

select cron.schedule(
  'sessionsignal-daily-retention-cleanup',
  '15 2 * * *',
  $$select public.delete_expired_sessionsignal_data();$$
);

comment on extension pg_cron is
  'Runs SessionSignal retention cleanup daily at 02:15 UTC.';
