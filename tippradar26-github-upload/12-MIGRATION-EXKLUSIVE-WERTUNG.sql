-- TippRadar26: Pro Tipp zaehlt nur die beste passende Ergebniskategorie.
-- Reihenfolge: exakt, Tordifferenz, Tendenz, Gesamtzahl Tore.

create or replace function public.calculate_tip_points(
  rules jsonb,
  tip_home integer,
  tip_away integer,
  actual_home integer,
  actual_away integer
)
returns numeric
language sql
immutable
as $$
  with rule_list as (
    select rule
    from jsonb_array_elements(rules) rule
    where not coalesce((rule->>'teamRule')::boolean, false)
  ),
  matching_rules as (
    select
      case rule->>'criterion'
        when 'exact' then 1
        when 'goal_difference' then 2
        when 'tendency' then 3
        when 'total_goals' then 4
        when 'home_goals' then 5
        when 'away_goals' then 6
        else 99
      end priority,
      (rule->>'points')::numeric points
    from rule_list
    where case rule->>'criterion'
      when 'exact' then tip_home = actual_home and tip_away = actual_away
      when 'goal_difference' then tip_home - tip_away = actual_home - actual_away
      when 'tendency' then sign(tip_home - tip_away) = sign(actual_home - actual_away)
      when 'total_goals' then tip_home + tip_away = actual_home + actual_away
      when 'home_goals' then tip_home = actual_home
      when 'away_goals' then tip_away = actual_away
      else false
    end
  )
  select coalesce((
    select points
    from matching_rules
    order by priority, points desc
    limit 1
  ), 0)
$$;

grant execute on function public.calculate_tip_points(jsonb, integer, integer, integer, integer)
to authenticated;
