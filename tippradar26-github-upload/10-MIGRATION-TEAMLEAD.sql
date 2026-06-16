-- TippRadar26: Ein Family-Team-Lead darf fuer alle Mitglieder des eigenen Teams tippen.

alter table public.participant_profiles
  alter column account_user_id drop not null;

create or replace function public.sync_current_participant_role()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league uuid;
  member_name text;
  prepared_role text;
  primary_profile uuid;
begin
  select league_id, display_name
  into target_league, member_name
  from public.league_members
  where user_id = auth.uid()
  limit 1;

  if target_league is null then
    return null;
  end if;

  select coalesce(member->>'role', 'adult')
  into prepared_role
  from public.league_state state
  cross join lateral jsonb_array_elements(state.teams) team
  cross join lateral jsonb_array_elements(team->'members') member
  where state.league_id = target_league
    and lower(trim(member->>'name')) = lower(trim(member_name))
    and not coalesce((member->>'bot')::boolean, false)
  limit 1;

  if prepared_role not in ('lead', 'adult', 'youth') then
    return null;
  end if;

  update public.league_members
  set account_type = case when prepared_role = 'lead' then 'family' else 'single' end
  where league_id = target_league
    and user_id = auth.uid();

  select id
  into primary_profile
  from public.participant_profiles
  where league_id = target_league
    and account_user_id = auth.uid()
    and is_primary
  limit 1;

  if primary_profile is not null then
    update public.participant_profiles
    set profile_type = prepared_role
    where id = primary_profile;
  else
    select id
    into primary_profile
    from public.participant_profiles
    where league_id = target_league
      and lower(trim(display_name)) = lower(trim(member_name))
      and account_user_id is null
    limit 1;

    if primary_profile is not null then
      update public.participant_profiles
      set account_user_id = auth.uid(),
          profile_type = prepared_role,
          is_primary = true
      where id = primary_profile;
    end if;
  end if;

  return prepared_role;
end
$$;

create or replace function public.sync_team_participant_profiles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league uuid;
  lead_name text;
  team_members jsonb;
  team_member jsonb;
  member_name text;
  member_role text;
  inserted_count integer := 0;
begin
  select league_id, display_name
  into target_league, lead_name
  from public.league_members
  where user_id = auth.uid()
    and account_type = 'family'
  limit 1;

  if target_league is null then
    raise exception 'Dieses Konto ist kein Family-Team-Lead';
  end if;

  select team->'members'
  into team_members
  from public.league_state state
  cross join lateral jsonb_array_elements(state.teams) team
  where state.league_id = target_league
    and exists (
      select 1
      from jsonb_array_elements(team->'members') lead_member
      where lower(trim(lead_member->>'name')) = lower(trim(lead_name))
        and coalesce(lead_member->>'role', 'adult') = 'lead'
        and not coalesce((lead_member->>'bot')::boolean, false)
    )
  limit 1;

  if team_members is null then
    raise exception 'Kein passendes Family-Team gefunden';
  end if;

  for team_member in select value from jsonb_array_elements(team_members)
  loop
    member_name := trim(team_member->>'name');
    member_role := coalesce(team_member->>'role', 'adult');

    if member_name <> ''
      and member_role in ('lead', 'adult', 'youth', 'child')
      and not coalesce((team_member->>'bot')::boolean, false)
      and not exists (
        select 1
        from public.participant_profiles profile
        where profile.league_id = target_league
          and lower(trim(profile.display_name)) = lower(member_name)
      )
    then
      insert into public.participant_profiles(
        league_id, account_user_id, display_name, profile_type, is_primary
      )
      values (
        target_league,
        case when member_role in ('lead', 'child') then auth.uid() else null end,
        member_name,
        member_role,
        false
      );
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return inserted_count;
end
$$;

create or replace function public.can_team_lead_manage_profile(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participant_profiles target
    join public.league_members lead_account
      on lead_account.league_id = target.league_id
     and lead_account.user_id = auth.uid()
     and lead_account.account_type = 'family'
    join public.league_state state
      on state.league_id = target.league_id
    cross join lateral jsonb_array_elements(state.teams) team
    where target.id = target_profile
      and exists (
        select 1
        from jsonb_array_elements(team->'members') lead_member
        where lower(trim(lead_member->>'name')) = lower(trim(lead_account.display_name))
          and coalesce(lead_member->>'role', 'adult') = 'lead'
          and not coalesce((lead_member->>'bot')::boolean, false)
      )
      and exists (
        select 1
        from jsonb_array_elements(team->'members') target_member
        where lower(trim(target_member->>'name')) = lower(trim(target.display_name))
          and not coalesce((target_member->>'bot')::boolean, false)
      )
  )
$$;

create or replace function public.can_manage_participant_profile(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participant_profiles profile
    where profile.id = target_profile
      and profile.account_user_id = auth.uid()
      and (profile.is_primary or profile.profile_type = 'child')
  )
  or public.can_team_lead_manage_profile(target_profile)
$$;

create or replace function public.can_directly_manage_participant_profile(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participant_profiles profile
    where profile.id = target_profile
      and profile.account_user_id = auth.uid()
      and (profile.is_primary or profile.profile_type = 'child')
  )
$$;

drop policy if exists "members read started profile tips" on public.profile_predictions;
create policy "members read started profile tips" on public.profile_predictions for select
using (
  public.can_manage_participant_profile(profile_id)
  or (
    public.is_league_member(league_id)
    and exists (
      select 1
      from public.match_schedule schedule
      where schedule.league_id = profile_predictions.league_id
        and schedule.match_id = profile_predictions.match_id
        and schedule.kickoff <= now()
    )
  )
);

drop policy if exists "owners write profile tips" on public.profile_predictions;
drop policy if exists "managed profiles insert tips" on public.profile_predictions;
drop policy if exists "profile owners update tips" on public.profile_predictions;
drop policy if exists "profile owners delete tips" on public.profile_predictions;

create policy "managed profiles insert tips" on public.profile_predictions for insert
with check (
  public.can_manage_participant_profile(profile_id)
  and exists (
    select 1
    from public.match_schedule schedule
    where schedule.league_id = profile_predictions.league_id
      and schedule.match_id = profile_predictions.match_id
      and schedule.kickoff > now()
  )
);

create policy "profile owners update tips" on public.profile_predictions for update
using (public.can_directly_manage_participant_profile(profile_id))
with check (
  public.can_directly_manage_participant_profile(profile_id)
  and exists (
    select 1
    from public.match_schedule schedule
    where schedule.league_id = profile_predictions.league_id
      and schedule.match_id = profile_predictions.match_id
      and schedule.kickoff > now()
  )
);

create policy "profile owners delete tips" on public.profile_predictions for delete
using (public.can_directly_manage_participant_profile(profile_id));

create or replace function public.save_profile_predictions(target_profile uuid, tips jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league uuid;
  direct_access boolean;
  changed integer := 0;
begin
  select league_id
  into target_league
  from public.participant_profiles
  where id = target_profile;

  if target_league is null or not public.can_manage_participant_profile(target_profile) then
    raise exception 'Dieses Profil darf von diesem Konto nicht getippt werden';
  end if;

  direct_access := public.can_directly_manage_participant_profile(target_profile);

  if direct_access then
    insert into public.profile_predictions(
      league_id, profile_id, match_id, home_score, away_score
    )
    select target_league, target_profile, item->>'match_id',
      (item->>'home_score')::smallint, (item->>'away_score')::smallint
    from jsonb_array_elements(tips) item
    where exists (
      select 1
      from public.match_schedule schedule
      where schedule.league_id = target_league
        and schedule.match_id = item->>'match_id'
        and schedule.kickoff > now()
    )
    on conflict (league_id, profile_id, match_id) do update set
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      updated_at = now();
  else
    insert into public.profile_predictions(
      league_id, profile_id, match_id, home_score, away_score
    )
    select target_league, target_profile, item->>'match_id',
      (item->>'home_score')::smallint, (item->>'away_score')::smallint
    from jsonb_array_elements(tips) item
    where exists (
      select 1
      from public.match_schedule schedule
      where schedule.league_id = target_league
        and schedule.match_id = item->>'match_id'
        and schedule.kickoff > now()
    )
      and not exists (
        select 1
        from public.profile_predictions existing
        where existing.league_id = target_league
          and existing.profile_id = target_profile
          and existing.match_id = item->>'match_id'
      )
    on conflict (league_id, profile_id, match_id) do nothing;
  end if;

  get diagnostics changed = row_count;
  return changed;
end
$$;

drop policy if exists "owners write fantasy picks" on public.fantasy_picks;
create policy "owners write fantasy picks" on public.fantasy_picks for all
using (public.can_manage_participant_profile(profile_id))
with check (public.can_manage_participant_profile(profile_id));

grant execute on function public.can_team_lead_manage_profile(uuid) to authenticated;
grant execute on function public.can_manage_participant_profile(uuid) to authenticated;
grant execute on function public.can_directly_manage_participant_profile(uuid) to authenticated;
grant execute on function public.sync_current_participant_role() to authenticated;
grant execute on function public.sync_team_participant_profiles() to authenticated;
grant execute on function public.save_profile_predictions(uuid, jsonb) to authenticated;
