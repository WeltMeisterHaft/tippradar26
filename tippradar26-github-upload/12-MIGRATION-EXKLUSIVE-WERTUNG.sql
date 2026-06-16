-- TippRadar26: Jugendliche koennen mit eigenem Konto tippen.

alter table public.participant_profiles
  drop constraint if exists participant_profiles_profile_type_check;

alter table public.participant_profiles
  add constraint participant_profiles_profile_type_check
  check (profile_type in ('lead', 'adult', 'youth', 'child'));

create or replace function public.set_participant_profile_type(
  target_profile uuid,
  target_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league uuid;
  profile_owner uuid;
begin
  if target_type not in ('lead', 'adult', 'youth', 'child') then
    raise exception 'Unbekannte Teilnehmerrolle';
  end if;

  select league_id, account_user_id
  into target_league, profile_owner
  from public.participant_profiles
  where id = target_profile;

  if target_league is null then
    raise exception 'Profil nicht gefunden';
  end if;

  if profile_owner <> auth.uid()
    and not public.is_league_organizer(target_league) then
    raise exception 'Keine Berechtigung fuer dieses Profil';
  end if;

  update public.participant_profiles
  set profile_type = target_type
  where id = target_profile;
end
$$;

create or replace function public.ensure_primary_profile(
  target_account_type text default 'single'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league uuid;
  member_name text;
  profile_id uuid;
  prepared_role text;
begin
  select league_id, display_name
  into target_league, member_name
  from public.league_members
  where user_id = auth.uid()
  limit 1;

  if target_league is null then
    raise exception 'Keine Tipprunde gefunden';
  end if;

  select coalesce(member->>'role', 'adult')
  into prepared_role
  from public.league_state ls
  cross join lateral jsonb_array_elements(ls.teams) team
  cross join lateral jsonb_array_elements(team->'members') member
  where ls.league_id = target_league
    and lower(trim(member->>'name')) = lower(trim(member_name))
    and coalesce((member->>'bot')::boolean, false) = false
  limit 1;

  if prepared_role is null and public.is_league_organizer(target_league) then
    prepared_role := 'adult';
  end if;

  if prepared_role not in ('lead', 'adult', 'youth') then
    raise exception 'Dieser Name ist nicht fuer einen eigenen Zugang vorbereitet';
  end if;

  if target_account_type = 'family' and prepared_role <> 'lead' then
    raise exception 'Nur ein vorbereiteter Family-Team-Lead darf Kinderprofile verwalten';
  end if;

  update public.league_members
  set account_type = case
    when target_account_type = 'family' then 'family'
    else 'single'
  end
  where league_id = target_league and user_id = auth.uid();

  select id into profile_id
  from public.participant_profiles
  where league_id = target_league
    and account_user_id = auth.uid()
    and is_primary
  limit 1;

  if profile_id is null then
    select id into profile_id
    from public.participant_profiles
    where league_id = target_league
      and lower(trim(display_name)) = lower(trim(member_name))
      and profile_type in ('adult', 'youth')
      and not is_primary
    limit 1;

    if profile_id is not null then
      update public.participant_profiles
      set account_user_id = auth.uid(),
          is_primary = true,
          profile_type = case
            when target_account_type = 'family' then 'lead'
            else prepared_role
          end
      where id = profile_id;
    else
      insert into public.participant_profiles(
        league_id, account_user_id, display_name, profile_type, is_primary
      )
      values (
        target_league, auth.uid(), member_name,
        case when target_account_type = 'family' then 'lead' else prepared_role end,
        true
      )
      returning id into profile_id;
    end if;
  else
    update public.participant_profiles
    set profile_type = case
      when target_account_type = 'family' then 'lead'
      else prepared_role
    end
    where id = profile_id;
  end if;

  return profile_id;
end
$$;

grant execute on function public.set_participant_profile_type(uuid, text) to authenticated;
grant execute on function public.ensure_primary_profile(text) to authenticated;
