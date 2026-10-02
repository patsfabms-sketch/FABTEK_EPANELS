-- Sign in with a username (first initial + last name) and a 6-digit PIN; email optional.
-- New people start on PIN 123456 and must pick their own the first time they sign in.
alter table public.team_members add column if not exists username text;
alter table public.team_members add column if not exists must_change boolean not null default false;
create unique index if not exists team_members_username on public.team_members (lower(username)) where username is not null;

create or replace function app.make_username(p_name text, p_email text) returns text language plpgsql stable security definer set search_path to '' as $$
declare w text[]; base text; u text; n int := 1;
begin
  w := regexp_split_to_array(lower(trim(coalesce(p_name, ''))), '\s+');
  if coalesce(array_length(w, 1), 0) >= 2 and w[1] <> '' then base := left(w[1], 1) || w[array_length(w, 1)];
  elsif coalesce(w[1], '') <> '' then base := w[1];
  else base := split_part(lower(coalesce(p_email, 'user')), '@', 1); end if;
  base := regexp_replace(base, '[^a-z0-9]', '', 'g');
  if base = '' then base := 'user'; end if;
  u := base;
  while exists (select 1 from public.team_members t where lower(t.username) = u) loop n := n + 1; u := base || n; end loop;
  return u;
end $$;

-- existing people get a username too
do $$ declare r record; begin
  for r in select email, name from public.team_members where username is null order by added_at loop
    update public.team_members set username = app.make_username(r.name, r.email) where email = r.email;
  end loop;
end $$;

-- the sign-in page turns a username into the account it signs in with
create or replace function public.login_email(p_user text) returns text language sql stable security definer set search_path to '' as $$
  select case when position('@' in coalesce(p_user, '')) > 0 then lower(trim(p_user))
    else (select t.email from public.team_members t where lower(t.username) = lower(trim(p_user)) limit 1) end
$$;
revoke all on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated;

-- after picking their own PIN
create or replace function public.pin_changed() returns void language sql security definer set search_path to '' as $$
  update public.team_members set must_change = false where email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
grant execute on function public.pin_changed() to authenticated;

-- the add-person function (service role) picks the username
create or replace function public.make_username_rpc(p_name text, p_email text) returns text language sql stable security definer set search_path to '' as $$
  select app.make_username(p_name, p_email)
$$;
revoke all on function public.make_username_rpc(text, text) from public, anon, authenticated;
grant execute on function public.make_username_rpc(text, text) to service_role;
