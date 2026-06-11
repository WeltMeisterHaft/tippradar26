(function () {
  const config = window.TIPPRADAR_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseKey && window.supabase);
  const client = configured ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
  let session = null;
  let league = null;

  async function init() {
    if (!client) return { configured: false };
    const result = await client.auth.getSession();
    session = result.data.session;
    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      window.dispatchEvent(new CustomEvent("tippradar-auth-change", { detail: { session } }));
    });
    if (session) await loadMembership();
    return { configured: true, session, league };
  }

  async function loadMembership() {
    const { data, error } = await client
      .from("league_members")
      .select("league_id, display_name, role, leagues(id, name, invite_code)")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    league = data ? {
      id: data.league_id,
      name: data.leagues.name,
      inviteCode: data.leagues.invite_code,
      displayName: data.display_name,
      role: data.role
    } : null;
    return league;
  }

  async function sendMagicLink(email) {
    if (!client) throw new Error("Supabase ist noch nicht eingerichtet.");
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    session = null;
    league = null;
  }

  async function createLeague(name, inviteCode, displayName) {
    const { data, error } = await client.rpc("create_tip_league", {
      league_name: name,
      join_code: inviteCode.toUpperCase(),
      member_name: displayName
    });
    if (error) throw error;
    await loadMembership();
    return data;
  }

  async function joinLeague(inviteCode, displayName) {
    const { data, error } = await client.rpc("join_tip_league", {
      join_code: inviteCode.toUpperCase(),
      member_name: displayName
    });
    if (error) throw error;
    await loadMembership();
    return data;
  }

  async function loadState() {
    if (!league) return null;
    const { data, error } = await client
      .from("league_state")
      .select("teams, scoring_rules")
      .eq("league_id", league.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function saveState(teams, scoringRules) {
    if (!league || league.role !== "organizer") return;
    const { error } = await client.from("league_state").upsert({
      league_id: league.id,
      teams,
      scoring_rules: scoringRules,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
  }

  async function loadPredictions() {
    if (!league || !session) return {};
    const { data, error } = await client
      .from("predictions")
      .select("match_id, home_score, away_score")
      .eq("league_id", league.id)
      .eq("user_id", session.user.id);
    if (error) throw error;
    return Object.fromEntries(data.map((tip) => [
      tip.match_id,
      { home: tip.home_score, away: tip.away_score }
    ]));
  }

  async function loadLeaguePredictions() {
    if (!league) return {};
    const [{ data: members, error: memberError }, { data: tips, error: tipError }] = await Promise.all([
      client.from("league_members").select("user_id, display_name").eq("league_id", league.id),
      client.from("predictions").select("user_id, match_id, home_score, away_score").eq("league_id", league.id)
    ]);
    if (memberError || tipError) return {};
    const names = Object.fromEntries((members || []).map((member) => [member.user_id, member.display_name]));
    const result = {};
    (tips || []).forEach((tip) => {
      const name = names[tip.user_id];
      if (!name) return;
      result[name] ||= {};
      result[name][tip.match_id] = `${tip.home_score}:${tip.away_score}`;
    });
    return result;
  }

  async function syncSchedule(matches) {
    if (!league || league.role !== "organizer") return;
    const payload = matches.map((match) => ({
      match_id: String(match.id),
      kickoff: match.kickoff,
      matchday: String(match.matchday),
      home_team: match.home,
      away_team: match.away
    }));
    const { error } = await client.rpc("sync_match_schedule", { schedule: payload });
    if (error) throw error;
  }

  async function loadTeamScores() {
    if (!league) return {};
    const [{ data: matchScores, error: matchError }, { data: dayScores, error: dayError }] = await Promise.all([
      client.from("team_match_scores").select("team_id, match_bonus").eq("league_id", league.id),
      client.from("team_matchday_bonuses").select("team_id, weighted_points, bonus_points").eq("league_id", league.id)
    ]);
    if (matchError || dayError) return {};
    const summary = {};
    (dayScores || []).forEach((row) => {
      summary[row.team_id] ||= { base: 0, matchBonus: 0, matchdayBonus: 0 };
      summary[row.team_id].base += Number(row.weighted_points || 0);
      summary[row.team_id].matchdayBonus += Number(row.bonus_points || 0);
    });
    (matchScores || []).forEach((row) => {
      summary[row.team_id] ||= { base: 0, matchBonus: 0, matchdayBonus: 0 };
      summary[row.team_id].matchBonus += Number(row.match_bonus || 0);
    });
    return summary;
  }

  async function savePredictions(tips) {
    if (!league || !session) return;
    const rows = Object.entries(tips).map(([matchId, tip]) => ({
      league_id: league.id,
      user_id: session.user.id,
      match_id: matchId,
      home_score: tip.home,
      away_score: tip.away,
      updated_at: new Date().toISOString()
    }));
    if (!rows.length) return;
    const { error } = await client.from("predictions").upsert(rows, {
      onConflict: "league_id,user_id,match_id"
    });
    if (error) throw error;
  }

  async function scoreMatch(matchId, matchday, homeScore, awayScore) {
    if (!league || league.role !== "organizer") return;
    const { error } = await client.rpc("score_finished_match", {
      target_match: String(matchId),
      target_matchday: String(matchday),
      actual_home: homeScore,
      actual_away: awayScore
    });
    if (error && !error.message.includes("Nur Organisatoren")) throw error;
  }

  window.TippRadarCloud = {
    init, sendMagicLink, signOut, createLeague, joinLeague,
    loadState, saveState, loadPredictions, loadLeaguePredictions, savePredictions,
    loadTeamScores, syncSchedule, scoreMatch,
    get configured() { return configured; },
    get session() { return session; },
    get league() { return league; }
  };
})();
