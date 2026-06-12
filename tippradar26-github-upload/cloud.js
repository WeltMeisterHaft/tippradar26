(function () {
  const config = window.TIPPRADAR_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseKey && window.supabase);
  const client = configured ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
  let session = null;
  let league = null;
  let profiles = [];
  let activeProfile = null;
  let organizerName = "";

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
      .select("league_id, display_name, role, account_type, leagues(id, name, invite_code)")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    league = data ? {
      id: data.league_id,
      name: data.leagues.name,
      inviteCode: data.leagues.invite_code,
      displayName: data.display_name,
      role: data.role,
      accountType: data.account_type || "single"
    } : null;
    if (league) {
      const { data: organizer } = await client.from("league_members")
        .select("display_name")
        .eq("league_id", league.id)
        .eq("role", "organizer")
        .limit(1)
        .maybeSingle();
      organizerName = organizer?.display_name || "";
      await loadProfiles();
    }
    return league;
  }

  async function ensurePrimaryProfile(accountType = "single") {
    const { error } = await client.rpc("ensure_primary_profile", { target_account_type: accountType });
    if (error) throw error;
    if (league) league.accountType = accountType;
    return loadProfiles();
  }

  async function loadProfiles() {
    if (!league || !session) return [];
    const { data, error } = await client.from("participant_profiles")
      .select("id, display_name, profile_type, auto_strategy, is_primary, account_user_id")
      .eq("league_id", league.id)
      .order("created_at");
    if (error) throw error;
    profiles = data || [];
    const owned = profiles.filter((profile) =>
      profile.account_user_id === session.user.id
      && (profile.is_primary || profile.profile_type === "child")
    );
    const remembered = localStorage.getItem(`tippradar26-active-profile-${league.id}`);
    activeProfile = owned.find((profile) => profile.id === remembered)
      || owned.find((profile) => profile.is_primary) || owned[0] || null;
    return profiles;
  }

  function selectProfile(profileId) {
    const profile = profiles.find((item) =>
      item.id === profileId
      && item.account_user_id === session?.user?.id
      && (item.is_primary || item.profile_type === "child")
    );
    if (!profile) return null;
    activeProfile = profile;
    localStorage.setItem(`tippradar26-active-profile-${league.id}`, profile.id);
    return profile;
  }

  async function addFamilyProfile(displayName) {
    const { error } = await client.rpc("add_family_profile", {
      profile_name: displayName,
      target_profile_type: "child"
    });
    if (error) throw error;
    await loadProfiles();
    activeProfile = profiles.filter((profile) =>
      profile.account_user_id === session.user.id && profile.profile_type === "child"
    ).at(-1);
    localStorage.setItem(`tippradar26-active-profile-${league.id}`, activeProfile.id);
    return activeProfile;
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
    profiles = [];
    activeProfile = null;
    organizerName = "";
  }

  async function createLeague(name, inviteCode, displayName) {
    const { data, error } = await client.rpc("create_tip_league", {
      league_name: name,
      join_code: inviteCode.toUpperCase(),
      member_name: displayName
    });
    if (error) throw error;
    await loadMembership();
    await ensurePrimaryProfile("single");
    return data;
  }

  async function joinLeague(inviteCode, displayName) {
    const { data, error } = await client.rpc("join_tip_league", {
      join_code: inviteCode.toUpperCase(),
      member_name: displayName
    });
    if (error) throw error;
    await loadMembership();
    await ensurePrimaryProfile("single");
    return data;
  }

  async function loadState() {
    if (!league) return null;
    let { data, error } = await client
      .from("league_state")
      .select("teams, scoring_rules, scoring_start")
      .eq("league_id", league.id)
      .maybeSingle();
    if (error && /scoring_start|column/i.test(error.message || "")) {
      const fallback = await client
        .from("league_state")
        .select("teams, scoring_rules")
        .eq("league_id", league.id)
        .maybeSingle();
      data = fallback.data ? { ...fallback.data, scoring_start: null } : null;
      error = fallback.error;
    }
    if (error) throw error;
    return data;
  }

  async function updateProfileType(profileId, profileType) {
    if (!league) throw new Error("Keine Tipprunde gefunden.");
    const { error } = await client.rpc("set_participant_profile_type", {
      target_profile: profileId,
      target_type: profileType
    });
    if (error) throw error;
    await loadProfiles();
  }

  async function renameProfile(profileId, displayName) {
    if (!league) throw new Error("Keine Tipprunde gefunden.");
    const { error } = await client.rpc("rename_participant_profile", {
      target_profile: profileId,
      new_display_name: displayName
    });
    if (error) throw error;
    await loadMembership();
  }

  async function setProfileAutoStrategy(profileId, strategy) {
    if (!league) throw new Error("Keine Tipprunde gefunden.");
    const { error } = await client.rpc("set_profile_auto_strategy", {
      target_profile: profileId,
      target_strategy: strategy
    });
    if (error) throw error;
    await loadProfiles();
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

  async function setScoringStart(scoringStart) {
    if (!league || league.role !== "organizer") {
      throw new Error("Nur der Organisator darf den Wertungsstart festlegen.");
    }
    const { error } = await client.rpc("set_league_scoring_start", {
      target_start: scoringStart
    });
    if (error) throw error;
  }

  async function loadPredictions() {
    if (!league || !activeProfile) return {};
    const { data, error } = await client
      .from("profile_predictions")
      .select("match_id, home_score, away_score")
      .eq("league_id", league.id)
      .eq("profile_id", activeProfile.id);
    if (error) throw error;
    return Object.fromEntries(data.map((tip) => [
      tip.match_id,
      { home: tip.home_score, away: tip.away_score }
    ]));
  }

  async function loadLeaguePredictions() {
    if (!league) return {};
    const [{ data: members, error: memberError }, { data: tips, error: tipError }] = await Promise.all([
      client.from("participant_profiles").select("id, display_name").eq("league_id", league.id),
      client.from("profile_predictions").select("profile_id, match_id, home_score, away_score").eq("league_id", league.id)
    ]);
    if (memberError || tipError) return {};
    const names = Object.fromEntries((members || []).map((member) => [member.id, member.display_name]));
    const result = {};
    (tips || []).forEach((tip) => {
      const name = names[tip.profile_id];
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
      client.from("team_match_scores").select("team_id, match_id, match_bonus").eq("league_id", league.id),
      client.from("team_matchday_bonuses").select("team_id, matchday, weighted_points, bonus_points").eq("league_id", league.id)
    ]);
    if (matchError || dayError) return {};
    const summary = {};
    (dayScores || []).forEach((row) => {
      summary[row.team_id] ||= { base: 0, matchBonus: 0, matchdayBonus: 0, matchWins: 0, matchdayWins: 0 };
      summary[row.team_id].base += Number(row.weighted_points || 0);
      summary[row.team_id].matchdayBonus += Number(row.bonus_points || 0);
      if (Number(row.bonus_points || 0) > 0) summary[row.team_id].matchdayWins += 1;
    });
    (matchScores || []).forEach((row) => {
      summary[row.team_id] ||= { base: 0, matchBonus: 0, matchdayBonus: 0, matchWins: 0, matchdayWins: 0 };
      summary[row.team_id].matchBonus += Number(row.match_bonus || 0);
      if (Number(row.match_bonus || 0) > 0) summary[row.team_id].matchWins += 1;
    });
    return summary;
  }

  async function savePredictions(tips) {
    if (!league || !activeProfile) return;
    const rows = Object.entries(tips).map(([matchId, tip]) => ({
      match_id: matchId,
      home_score: tip.home,
      away_score: tip.away
    }));
    if (!rows.length) return;
    const { error } = await client.rpc("save_profile_predictions", {
      target_profile: activeProfile.id, tips: rows
    });
    if (error) throw error;
  }

  async function savePredictionsForProfile(profileId, tips) {
    if (!league || !profileId) return;
    const rows = Object.entries(tips).map(([matchId, tip]) => ({
      match_id: matchId,
      home_score: tip.home,
      away_score: tip.away
    }));
    if (!rows.length) return;
    const { error } = await client.rpc("save_profile_predictions", {
      target_profile: profileId,
      tips: rows
    });
    if (error) throw error;
  }

  async function loadFantasyPicks() {
    if (!league || !activeProfile) return [];
    const { data, error } = await client.from("fantasy_picks")
      .select("slot, player_id, player_name, api_team_id, national_team")
      .eq("league_id", league.id).eq("profile_id", activeProfile.id).order("slot");
    if (error) throw error;
    return data || [];
  }

  async function saveFantasyPicks(picks) {
    if (!activeProfile) return;
    const { error } = await client.rpc("save_fantasy_picks", {
      target_profile: activeProfile.id, picks
    });
    if (error) throw error;
  }

  async function recordPlayerEvent(matchId, playerName, nationalTeam, goals) {
    const { error } = await client.rpc("record_player_event", {
      target_match: String(matchId), scorer_name: playerName,
      scorer_team: nationalTeam, scorer_goals: goals
    });
    if (error) throw error;
  }

  async function replaceGoalEvents(matchId, events) {
    const { error } = await client.rpc("replace_api_goal_events", {
      target_match: String(matchId),
      goal_events: events
    });
    if (error) throw error;
  }

  async function loadScorerTotals() {
    if (!league) return {};
    const { data, error } = await client.from("player_match_events")
      .select("player_id, player_name, goals")
      .eq("league_id", league.id);
    if (error) throw error;
    return (data || []).reduce((totals, row) => {
      const key = row.player_id
        ? `id:${row.player_id}`
        : `name:${String(row.player_name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()}`;
      totals[key] = Number(totals[key] || 0) + Number(row.goals || 0);
      return totals;
    }, {});
  }

  async function footballRequest(action, parameters = {}) {
    if (!session) throw new Error("Bitte zuerst anmelden.");
    const query = new URLSearchParams({ action, ...parameters });
    const response = await fetch(`/api/football?${query}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error(body.error || "Fu\u00dfballdaten nicht erreichbar.");
    return body;
  }

  function loadFootballDay(date) {
    return footballRequest("day", { date });
  }

  function loadTeamSquad(team) {
    return footballRequest("team-squad", { team });
  }

  function loadPublicSquad(team) {
    return footballRequest("public-squad", { team });
  }

  function loadFootballEvents(fixture) {
    return footballRequest("events", { fixture });
  }

  function activeBotIds(teams) {
    const seenNames = new Set();
    return new Set((teams || []).flatMap((team) =>
      (team.members || []).filter((member) => {
        if (!member.bot) return false;
        const name = String(member.name || "").toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (!name || seenNames.has(name)) return false;
        seenNames.add(name);
        return true;
      }).map((member) => String(member.id))
    ));
  }

  async function loadStandings() {
    if (!league) return [];
    const { data: allProfiles } = await client.from("participant_profiles")
      .select("id, display_name").eq("league_id", league.id);
    const { data: tipPoints } = await client.from("profile_predictions")
      .select("profile_id, points").eq("league_id", league.id);
    const { data: fantasyPoints } = await client.from("fantasy_match_points")
      .select("profile_id, goal_points, win_points").eq("league_id", league.id);
    const { data: botPoints } = await client.from("bot_predictions")
      .select("bot_id, bot_name, points").eq("league_id", league.id);
    const { data: state } = await client.from("league_state")
      .select("teams").eq("league_id", league.id).maybeSingle();
    const configuredBotIds = activeBotIds(state?.teams);
    const humans = (allProfiles || []).map((profile) => ({
      ...profile,
      tipPoints: (tipPoints || []).filter((row) => row.profile_id === profile.id)
        .reduce((sum, row) => sum + Number(row.points || 0), 0),
      fantasyPoints: (fantasyPoints || []).filter((row) => row.profile_id === profile.id)
        .reduce((sum, row) => sum + Number(row.goal_points || 0) + Number(row.win_points || 0), 0)
    }));
    const activeBotPoints = configuredBotIds.size
      ? (botPoints || []).filter((row) => configuredBotIds.has(String(row.bot_id)))
      : (botPoints || []);
    const bots = Object.values(activeBotPoints.reduce((result, row) => {
      result[row.bot_id] ||= {
        id: row.bot_id, display_name: row.bot_name, tipPoints: 0, fantasyPoints: 0
      };
      result[row.bot_id].tipPoints += Number(row.points || 0);
      return result;
    }, {}));
    return [...humans, ...bots];
  }

  async function loadPointDetails() {
    if (!league) return null;
    const [
      { data: profiles, error: profileError },
      { data: profileTips, error: tipError },
      { data: fantasy, error: fantasyError },
      { data: bots, error: botError },
      { data: schedule, error: scheduleError },
      { data: teamMatches, error: teamMatchError },
      { data: teamDays, error: teamDayError }
    ] = await Promise.all([
      client.from("participant_profiles")
        .select("id, display_name").eq("league_id", league.id),
      client.from("profile_predictions")
        .select("profile_id, match_id, home_score, away_score, points").eq("league_id", league.id),
      client.from("fantasy_match_points")
        .select("profile_id, match_id, goal_points, win_points").eq("league_id", league.id),
      client.from("bot_predictions")
        .select("bot_id, bot_name, team_id, match_id, home_score, away_score, points").eq("league_id", league.id),
      client.from("match_schedule")
        .select("match_id, kickoff, matchday, home_team, away_team").eq("league_id", league.id).order("kickoff"),
      client.from("team_match_scores")
        .select("team_id, match_id, matchday, weighted_points, match_bonus").eq("league_id", league.id),
      client.from("team_matchday_bonuses")
        .select("team_id, matchday, weighted_points, bonus_points").eq("league_id", league.id)
    ]);
    const firstError = profileError || tipError || fantasyError || botError
      || scheduleError || teamMatchError || teamDayError;
    if (firstError) throw firstError;
    const state = await loadState();
    const configuredBotIds = activeBotIds(state?.teams);
    return {
      profiles: profiles || [],
      profileTips: profileTips || [],
      fantasy: fantasy || [],
      bots: configuredBotIds.size
        ? (bots || []).filter((row) => configuredBotIds.has(String(row.bot_id)))
        : (bots || []),
      schedule: schedule || [],
      teamMatches: teamMatches || [],
      teamDays: teamDays || []
    };
  }

  async function saveBotPredictions(tips) {
    if (!league || league.role !== "organizer" || !tips.length) return;
    const { error } = await client.rpc("upsert_bot_predictions", {
      bot_tips: tips.map((tip) => ({
        bot_id: tip.botId,
        bot_name: tip.botName,
        team_id: tip.teamId,
        match_id: tip.matchId,
        home_score: tip.home,
        away_score: tip.away,
        strategy: tip.strategy
      }))
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
    init, sendMagicLink, signOut, createLeague, joinLeague, ensurePrimaryProfile,
    loadProfiles, selectProfile, addFamilyProfile, updateProfileType, renameProfile, setProfileAutoStrategy,
    loadState, saveState, setScoringStart, loadPredictions, loadLeaguePredictions, savePredictions, savePredictionsForProfile, saveBotPredictions,
    loadFantasyPicks, saveFantasyPicks, recordPlayerEvent, replaceGoalEvents, loadScorerTotals, loadStandings,
    loadFootballDay, loadTeamSquad, loadPublicSquad, loadFootballEvents,
    loadTeamScores, loadPointDetails, syncSchedule, scoreMatch,
    get configured() { return configured; },
    get session() { return session; },
    get league() { return league; },
    get profiles() { return profiles; },
    get activeProfile() { return activeProfile; },
    get organizerName() { return organizerName; }
  };
})();
