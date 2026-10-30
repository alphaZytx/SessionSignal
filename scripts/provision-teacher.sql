-- Run as a database owner after creating the teacher in Supabase Auth.
-- Replace the UUID and display name deliberately. Never expose this operation to
-- a browser client and never derive the teacher role from editable user_metadata.

begin;

insert into public.profiles (id, role, display_name)
values ('00000000-0000-0000-0000-000000000000', 'teacher', 'SessionSignal Teacher')
on conflict (id) do update set
  role = 'teacher',
  display_name = excluded.display_name,
  updated_at = now();

commit;
