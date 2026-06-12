-- TippRadar26: Organisator-Einladungen per E-Mail mit automatischer Profilzuordnung.

create table if not exists public.participant_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  profile_id uuid not null references public.participant_profiles(id) on delete cascade,
  email text not null,
  invited_at timestamptz not null default now(),
  claimed_at timestamptz,
  unique (profile_id)
);

alter table public.participant_invites enable row level security;

create or replace function public.set_participant_invite(
  target_name text,
  target_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league uuid;
  prepared_role text;
  target_profile uuid;
  existing_owner uuid;
begin
  select league_id
  into target_league
  from public.league_members
  where user_id = auth.uid()
    and role = 'organizer'
  limit 1;

  if target_league is null then
    raise exception 'Nur der Organisator darf Einladungen versenden';
  end if;

  if trim(target_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Bitte eine gueltige E-Mail-Adresse eingeben';
  end if;

  select coalesce(member->>'role', 'adult')
  into prepared_role
  from public.league_state state
  cross join lateral jsonb_array_elements(state.teams) team
  cross join lateral jsonb_array_elements(team->'members') member
  where state.league_id = target_league
    and lower(trim(member->>'name')) = lower(trim(target_name))
    and not coalesce((member->>'bot')::boolean, false)
  limit 1;

  if prepared_role not in ('lead', 'adult', 'youth') then
    raise exception 'Nur Team-Leads, Erwachsene und Jugendliche erhalten einen eigenen Zugang';
  end if;

  select id, account_user_id
  into target_profile, existing_owner
  from public.participant_profiles
  where league_id = target_league
    and lower(trim(display_name)) = lower(trim(target_name))
  limit 1;

  if target_profile is null then
    insert into public.participant_profiles(
      league_id, account_user_id, display_name, profile_type, is_primary
    )
    values (
      target_league, null, trim(target_name), prepared_role, false
    )
    returning id into target_profile;
  elsif existing_owner is not null then
    raise exception 'Dieses Teilnehmerprofil besitzt bereits einen aktiven Zugang';
  end if;

  insert into public.participant_invites(
    league_id, profile_id, email, invited_at, claimed_at
  )
  values (
    target_league, target_profile, lower(trim(target_email)), now(), null
  )
  on conflict (profile_id) do update set
    email = excluded.email,
    invited_at = now(),
    claimed_at = null;

  return target_profile;
end
$$;

create or replace function public.list_participant_invites()
returns table (
  profile_id uuid,
  display_name text,
  email text,
  invited_at timestamptz,
  claimed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select invite.profile_id, profile.display_name, invite.email,
    invite.invited_at, invite.claimed_at
  from public.participant_invites invite
  join public.participant_profiles profile on profile.id = invite.profile_id
  where public.is_league_organizer(invite.league_id)
  order by profile.display_name
$$;

create or replace function public.claim_participant_invite()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  login_email text;
  selected_invite public.participant_invites%rowtype;
  profile_name text;
  profile_role text;
  existing_owner uuid;
begin
  login_email := lower(trim(coalesce(auth.jwt()->>'email', '')));
  if auth.uid() is null or login_email = '' then
    return null;
  end if;

  select invite.*
  into selected_invite
  from public.participant_invites invite
  where lower(trim(invite.email)) = login_email
  order by invite.invited_at desc
  limit 1;

  if selected_invite.id is null then
    return null;
  end if;

  select display_name, profile_type, account_user_id
  into profile_name, profile_role, existing_owner
  from public.participant_profiles
  where id = selected_invite.profile_id;

  if existing_owner is not null and existing_owner <> auth.uid() then
    raise exception 'Diese Einladung wurde bereits von einem anderen Zugang verwendet';
  end if;

  insert into public.league_members(
    league_id, user_id, display_name, role, account_type
  )
  values (
    selected_invite.league_id,
    auth.uid(),
    profile_name,
    'member',
    case when profile_role = 'lead' then 'family' else 'single' end
  )
  on conflict (league_id, user_id) do update set
    display_name = excluded.display_name,
    account_type = excluded.account_type;

  update public.participant_profiles
  set account_user_id = auth.uid(),
      is_primary = true
  where id = selected_invite.profile_id;

  update public.participant_invites
  set claimed_at = coalesce(claimed_at, now())
  where id = selected_invite.id;

  return selected_invite.league_id;
end
$$;

grant execute on function public.set_participant_invite(text, text) to authenticated;
grant execute on function public.list_participant_invites() to authenticated;
grant execute on function public.claim_participant_invite() to authenticated;
