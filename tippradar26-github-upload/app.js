const demoMatches = [
  {
    id: "mex-za", time: "Do / 21:00", group: "Gruppe A / Mexico City",
    kickoff: "2026-06-11T21:00:00+02:00", matchday: "1",
    home: "Mexiko", away: "S\u00fcdafrika", homeFlag: "&#x1F1F2;&#x1F1FD;", awayFlag: "&#x1F1FF;&#x1F1E6;"
  },
  {
    id: "kor-cze", time: "Fr / 03:00", group: "Gruppe A / Guadalajara",
    kickoff: "2026-06-12T03:00:00+02:00", matchday: "1",
    home: "S\u00fcdkorea", away: "Tschechien", homeFlag: "&#x1F1F0;&#x1F1F7;", awayFlag: "&#x1F1E8;&#x1F1FF;"
  },
  {
    id: "can-bih", time: "Fr / 21:00", group: "Gruppe B / Toronto",
    kickoff: "2026-06-12T21:00:00+02:00", matchday: "1",
    home: "Kanada", away: "Bosnien-Herzegowina", homeFlag: "&#x1F1E8;&#x1F1E6;", awayFlag: "&#x1F1E7;&#x1F1E6;"
  }
];
let matches = [...demoMatches];

const teamStorageKey = "tippradar26-teams-v2";
const ruleStorageKey = "tippradar26-rules-v2";
let teams = deduplicateBots(JSON.parse(localStorage.getItem(teamStorageKey) || "[]")).teams;
let scoringRules = JSON.parse(localStorage.getItem(ruleStorageKey) || "null") || [
  { id: "exact", criterion: "exact", name: "Exaktes Ergebnis", points: 4, locked: true },
  { id: "difference", criterion: "goal_difference", name: "Richtige Tordifferenz", points: 3, locked: true },
  { id: "tendency", criterion: "tendency", name: "Richtige Tendenz", points: 2, locked: true },
  { id: "goals", criterion: "total_goals", name: "Richtige Gesamtzahl Tore", points: 1, locked: true },
  { id: "team-match", criterion: "team_best_match", name: "Bestes Team je Spiel", points: 1, locked: true, teamRule: true },
  { id: "team-matchday", criterion: "team_best_matchday", name: "Bestes Team je Spieltag", points: 1, locked: true, teamRule: true }
];
const botStrategyNames = {
  dog: "DOG-TIP / Zufall",
  rank: "RANK-TIP / FIFA-Rangliste",
  stat: "STAT-TIP / Rang + Tormodell"
};
const rankingSnapshotDate = "19. November 2025";
const fifaRank = {
  "spanien": 1, "argentinien": 2, "argentina": 2, "frankreich": 3, "england": 4,
  "brasilien": 5, "portugal": 6, "niederlande": 7, "belgien": 8, "deutschland": 9,
  "kroatien": 10, "marokko": 11, "italien": 12, "kolumbien": 13, "usa": 14,
  "vereinigte staaten": 14, "mexiko": 15, "uruguay": 16, "schweiz": 17, "japan": 18,
  "senegal": 19, "tschechien": 19, "iran": 20, "danemark": 21, "sudkorea": 22,
  "ecuador": 23, "osterreich": 24, "turkei": 25, "australien": 26, "kanada": 27,
  "ukraine": 28, "norwegen": 29, "panama": 30, "polen": 31, "wales": 32,
  "algerien": 33, "agypten": 34, "schottland": 35, "serbien": 36, "paraguay": 37,
  "tunesien": 38, "elfenbeinkuste": 39, "cote d'ivoire": 39, "nigeria": 40,
  "kamerun": 41, "costa rica": 42, "katar": 43, "saudi-arabien": 44,
  "saudi arabien": 44, "sudafrika": 45, "irak": 46, "jamaika": 47, "honduras": 48,
  "usbekistan": 49, "neuseeland": 50, "jordanien": 51, "kap verde": 52,
  "curacao": 53, "bosnien-herzegowina": 70, "bosnien und herzegowina": 70
};
const teamBonusDefaults = [
  { id: "team-match", criterion: "team_best_match", name: "Bestes Team je Spiel", points: 1, locked: true, teamRule: true },
  { id: "team-matchday", criterion: "team_best_matchday", name: "Bestes Team je Spieltag", points: 1, locked: true, teamRule: true }
];

function ensureTeamBonusRules() {
  scoringRules = scoringRules.filter((rule) => rule.criterion !== "wrong" && rule.id !== "wrong");
  scoringRules.forEach((rule) => {
    if (["exact", "goal_difference", "tendency", "total_goals", "team_best_match", "team_best_matchday"].includes(rule.criterion)) {
      rule.locked = true;
    }
  });
  teamBonusDefaults.forEach((defaultRule) => {
    if (!scoringRules.some((rule) => rule.criterion === defaultRule.criterion)) {
      scoringRules.push({ ...defaultRule });
    }
  });
}

const storageKey = "tippradar26-tips";
let savedTips = JSON.parse(localStorage.getItem(storageKey) || "{}");
let selectedSeries = null;
let teamScoreSummary = {};
let leaguePredictions = {};
let fantasyPicks = [];
let profileStandings = [];
let scoringStart = null;
let pointDetails = null;
let tournamentSchedule = [...demoMatches];
let tournamentTeams = [...new Set(demoMatches.flatMap((match) => [match.home, match.away]))]
  .sort((a, b) => a.localeCompare(b, "de"));
const squadCache = {};
const squadRequests = {};
const matchesList = document.querySelector("#matches-list");
const toast = document.querySelector("#toast");

function formatMatchTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin"
  }).format(date).replace(",", " /");
}

function normalizeOpenLigaMatch(apiMatch, index) {
  const fallback = demoMatches[index % demoMatches.length];
  const finalResult = (apiMatch.matchResults || []).find((result) => result.resultTypeID === 2);
  return {
    ...fallback,
    id: String(apiMatch.matchID),
    kickoff: apiMatch.matchDateTimeUTC || apiMatch.matchDateTime,
    time: formatMatchTime(apiMatch.matchDateTime),
    group: apiMatch.group?.groupName || "WM 2026",
    home: apiMatch.team1?.teamName || fallback.home,
    away: apiMatch.team2?.teamName || fallback.away,
    homeFlag: apiMatch.team1?.teamIconUrl ? `<img src="${apiMatch.team1.teamIconUrl}" alt="">` : fallback.homeFlag,
    awayFlag: apiMatch.team2?.teamIconUrl ? `<img src="${apiMatch.team2.teamIconUrl}" alt="">` : fallback.awayFlag,
    result: finalResult ? `${finalResult.pointsTeam1}:${finalResult.pointsTeam2}` : null,
    matchday: apiMatch.group?.groupOrderID || apiMatch.group?.groupName || "1",
    openLigaId: apiMatch.matchID
  };
}

function sameBerlinDay(value, reference = new Date()) {
  return dateKey(value) === dateKey(reference);
}

function updateHomeHero(schedule) {
  if (!schedule?.length) return;
  const now = Date.now();
  const upcoming = schedule.filter((match) => new Date(match.kickoff).getTime() > now);
  const featured = upcoming[0] || [...schedule].reverse().find((match) => match.result) || schedule[0];
  const kickoff = new Date(featured.kickoff);
  const isUpcoming = kickoff.getTime() > now;
  const isToday = sameBerlinDay(featured.kickoff);
  const phase = featured.group || "WM 2026";
  const timeLabel = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Berlin"
  }).format(kickoff).replace(",", " \u00b7").toUpperCase();

  document.querySelector("#hero-match-label").textContent = isUpcoming
    ? (isToday ? "Heute" : "N\u00e4chstes Spiel")
    : "Letztes Ergebnis";
  document.querySelector("#hero-match-location").textContent = phase;
  document.querySelector("#hero-home-flag").innerHTML = featured.homeFlag;
  document.querySelector("#hero-away-flag").innerHTML = featured.awayFlag;
  document.querySelector("#hero-home-name").textContent = featured.home;
  document.querySelector("#hero-away-name").textContent = featured.away;
  document.querySelector("#hero-kickoff").textContent = timeLabel;
  document.querySelector("#hero-versus").textContent = featured.result || "VS";
  document.querySelector("#hero-score-label").textContent = featured.result ? "Ergebnis" : "Status";
  document.querySelector("#hero-score").textContent = featured.result || (isToday ? "Heute" : "Kommend");

  const countdown = document.querySelector("#countdown");
  if (isUpcoming) {
    const diff = kickoff.getTime() - now;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.max(1, Math.floor((diff % 3600000) / 60000));
    countdown.textContent = hours >= 24
      ? `${Math.floor(hours / 24)} Tag${Math.floor(hours / 24) === 1 ? "" : "e"}`
      : `${hours ? `${hours} Std. ` : ""}${minutes} Min.`;
    document.querySelector("#hero-status-copy").textContent =
      `${isToday ? "Heute geht's weiter" : "N\u00e4chstes Spiel"} \u00b7 noch `;
  } else {
    countdown.textContent = "Turnier l\u00e4uft";
    document.querySelector("#hero-status-copy").textContent = "WM 2026 \u00b7 ";
  }
  document.querySelector("#today-kicker").textContent = isToday ? "Heute in unserer Runde" : "Die n\u00e4chsten Spiele";
  document.querySelector("#today-heading").textContent = isToday ? "Heute geht es weiter." : "Der n\u00e4chste Anpfiff kommt.";
  document.querySelector("#today-tip-copy").textContent = isUpcoming
    ? `Tipp f\u00fcr ${featured.home} gegen ${featured.away} rechtzeitig abgeben.`
    : "Die n\u00e4chsten Spiele werden geladen.";
}

function updateDateTabs(schedule) {
  const container = document.querySelector("#date-tabs");
  if (!container || !schedule?.length) return;
  const today = dateKey(new Date());
  const grouped = Object.values(schedule.reduce((days, match) => {
    const key = dateKey(match.kickoff);
    days[key] ||= { key, date: new Date(match.kickoff), count: 0 };
    days[key].count += 1;
    return days;
  }, {})).sort((a, b) => a.date - b.date);
  const futureDays = grouped.filter((day) => day.key >= today);
  const visibleDays = (futureDays.length ? futureDays : grouped.slice(-3)).slice(0, 3);
  container.innerHTML = visibleDays.map((day, index) => {
    const weekday = new Intl.DateTimeFormat("de-DE", {
      weekday: "short", timeZone: "Europe/Berlin"
    }).format(day.date).replace(".", "").toUpperCase();
    const date = new Intl.DateTimeFormat("de-DE", {
      day: "2-digit", month: "short", timeZone: "Europe/Berlin"
    }).format(day.date).replace(".", "").toUpperCase();
    return `<button class="date-tab ${index === 0 ? "active" : ""}">
      <small>${weekday}</small><strong>${date}</strong><span>${day.count} Spiel${day.count === 1 ? "" : "e"}</span>
    </button>`;
  }).join("");
}

async function loadOpenLigaMatches() {
  const status = document.querySelector("#match-data-status");
  try {
    const response = await fetch("https://api.openligadb.de/getmatchdata/wm26/2026");
    if (!response.ok) throw new Error(`OpenLigaDB ${response.status}`);
    const data = await response.json();
    const normalized = data
      .filter((match) => match.team1 && match.team2)
      .sort((a, b) => new Date(a.matchDateTime) - new Date(b.matchDateTime))
      .map(normalizeOpenLigaMatch);
    if (!normalized.length) throw new Error("Keine WM-Spiele gefunden");
    tournamentSchedule = normalized;
    updateHomeHero(normalized);
    updateDateTabs(normalized);
    tournamentTeams = [...new Set(normalized.flatMap((match) => [match.home, match.away]))]
      .sort((a, b) => a.localeCompare(b, "de"));
    if (window.TippRadarCloud?.league?.role === "organizer") {
      await window.TippRadarCloud.syncSchedule(normalized);
    }
    const recentBoundary = Date.now() - (6 * 60 * 60 * 1000);
    const relevant = normalized.filter((match) => new Date(match.kickoff).getTime() >= recentBoundary);
    matches = (relevant.length ? relevant : normalized.slice(-12)).slice(0, 12);
    await syncOwnedAutomaticProfiles();
    if (window.TippRadarCloud?.league) {
      leaguePredictions = await window.TippRadarCloud.loadLeaguePredictions();
      savedTips = await window.TippRadarCloud.loadPredictions();
    }
    status.textContent = "Spielplan live von OpenLigaDB";
    status.parentElement.classList.add("connected");
    renderMatches();
    renderTipMatrix();
    renderFantasyPicks();
    renderPointDetails();
    if (window.TippRadarCloud?.league?.role === "organizer") {
      await syncApiFootballEvents(normalized);
      for (const match of normalized.filter((item) => item.result && isMatchCounted(item))) {
        const [home, away] = match.result.split(":").map(Number);
        await window.TippRadarCloud.scoreMatch(match.id, match.matchday, home, away).catch(() => {});
      }
      teamScoreSummary = await window.TippRadarCloud.loadTeamScores();
      pointDetails = await window.TippRadarCloud.loadPointDetails();
      renderTeams();
      renderPointDetails();
    }
  } catch (error) {
    status.textContent = "Demo-Spielplan / OpenLigaDB nicht erreichbar";
    status.parentElement.classList.add("fallback");
  }
}

function renderMatches() {
  const activeAutoStrategy = window.TippRadarCloud?.activeProfile?.auto_strategy || "manual";
  const automatic = activeAutoStrategy !== "manual";
  matchesList.innerHTML = matches.map((match) => {
    const tip = savedTips[match.id] || {};
    const counted = isMatchCounted(match);
    const open = isMatchOpen(match) && counted;
    return `
      <article class="match-card ${open ? "" : "match-locked"}" data-match="${match.id}" data-kickoff="${match.kickoff}">
        <div class="match-meta"><strong>${match.time}</strong><span>${match.group}</span></div>
        <div class="match-teams">
          <div class="match-team"><span class="small-flag">${match.homeFlag}</span>${match.home}</div>
          <div class="match-team"><span class="small-flag">${match.awayFlag}</span>${match.away}</div>
        </div>
        <div class="score-inputs" aria-label="Ergebnis fuer ${match.home} gegen ${match.away}">
          <input class="score-input" data-side="home" type="number" min="0" max="20" inputmode="numeric" value="${tip.home ?? ""}" aria-label="Tore ${match.home}" ${open && !automatic ? "" : "disabled"}>
          <span>:</span>
          <input class="score-input" data-side="away" type="number" min="0" max="20" inputmode="numeric" value="${tip.away ?? ""}" aria-label="Tore ${match.away}" ${open && !automatic ? "" : "disabled"}>
        </div>
        <div class="match-insights">
          <div class="cooper-pick">
            <span class="cooper-badge">A</span>
            <span><small>Auto-Tipper</small><strong>DOG / RANK / STAT</strong></span>
            <span class="confidence">${open ? "Tipps bis Anpfiff geheim" : "Tipps sichtbar"}</span>
          </div>
        </div>
        <div class="model-strip">
          <span><small>DOG</small><b>Zufall</b></span>
          <span><small>RANK</small><b>FIFA-Rang</b></span>
          <span><small>STAT</small><b>Tormodell</b></span>
        </div>
        ${!counted
          ? '<div class="locked-label excluded-label">Au&szlig;er Wertung</div>'
          : automatic && open
          ? `<div class="locked-label auto-label">AUTO · ${activeAutoStrategy.toUpperCase()}</div>`
          : (open ? "" : '<div class="locked-label">Tipp geschlossen</div>')}
      </article>`;
  }).join("");
  document.querySelector("#save-tips").disabled = automatic;
  document.querySelectorAll(".score-input").forEach((input) => input.addEventListener("input", updateProgress));
  updateProgress();
  renderScorerMatches();
}

function isMatchOpen(match) {
  return !match.kickoff || Date.now() < new Date(match.kickoff).getTime();
}

function isMatchCounted(match) {
  return !scoringStart || !match.kickoff
    || new Date(match.kickoff).getTime() >= new Date(scoringStart).getTime();
}

function formatScoringStart(value) {
  if (!value) return "Alle Spiele z\u00e4hlen";
  return `Wertung ab ${new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin"
  }).format(new Date(value))}`;
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function collectTips() {
  const tips = {};
  document.querySelectorAll(".match-card").forEach((card) => {
    if (card.classList.contains("match-locked")) return;
    const home = card.querySelector('[data-side="home"]').value;
    const away = card.querySelector('[data-side="away"]').value;
    if (home !== "" && away !== "") tips[card.dataset.match] = { home: Number(home), away: Number(away) };
  });
  return tips;
}

function updateProgress() {
  const count = Object.keys(collectTips()).length;
  document.querySelector("#tip-progress").textContent = `${count} von ${matches.length} Tipps abgegeben`;
  const status = document.querySelector(".tip-status");
  if (count > 0) {
    status.querySelector("h3").textContent = `${count} Tipp${count === 1 ? "" : "s"} bereit`;
    status.querySelector("p").textContent = count === matches.length ? "Perfekt, du bist vorbereitet." : "Ein guter Anfang. Da geht noch was.";
  }
  renderTipMatrix();
}

function tipForParticipant(participant, match, index) {
  if (participant.cooper) {
    if (isMatchOpen(match)) return "\u2013";
    const member = teams.flatMap((team) => team.members).find((item) => item.id === participant.id);
    return member ? botTip(member, match) : "\u2013";
  }
  return leaguePredictions[participant.name]?.[match.id] || "\u2013";
}

function seededNumber(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function normalizedTeamName(name) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function rankFor(teamName) {
  const normalized = normalizedTeamName(teamName);
  if (fifaRank[normalized]) return fifaRank[normalized];
  const alias = Object.keys(fifaRank).find((name) => normalized.includes(name) || name.includes(normalized));
  return alias ? fifaRank[alias] : 55;
}

function rankTip(match) {
  const difference = rankFor(match.away) - rankFor(match.home);
  if (Math.abs(difference) <= 5) return "1:1";
  if (difference > 0) return difference >= 25 ? "2:0" : "2:1";
  return difference <= -25 ? "0:2" : "1:2";
}

function poissonProbability(goals, expected) {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) factorial *= value;
  return (Math.exp(-expected) * (expected ** goals)) / factorial;
}

function statTip(match) {
  const rankGap = rankFor(match.away) - rankFor(match.home);
  const homeExpected = Math.max(0.35, Math.min(2.8, 1.3 + (rankGap * 0.018)));
  const awayExpected = Math.max(0.35, Math.min(2.8, 1.15 - (rankGap * 0.018)));
  let best = { home: 0, away: 0, probability: -1 };
  for (let home = 0; home <= 6; home += 1) {
    for (let away = 0; away <= 6; away += 1) {
      const probability = poissonProbability(home, homeExpected) * poissonProbability(away, awayExpected);
      if (probability > best.probability) best = { home, away, probability };
    }
  }
  return `${best.home}:${best.away}`;
}

function dogTip(match, seed) {
  const options = ["0:0", "1:0", "0:1", "1:1", "2:0", "0:2", "2:1", "1:2", "2:2", "3:1", "1:3"];
  return options[Math.floor(seededNumber(`${match.id}-${seed}`) * options.length)];
}

function botTip(member, match) {
  const strategy = member.strategy === "cooper" ? "stat" : (member.strategy || "dog");
  if (strategy === "stat") return statTip(match);
  if (strategy === "rank") return rankTip(match);
  return dogTip(match, member.id);
}

function automaticProfileTips(profile, strategy) {
  return Object.fromEntries(matches.filter(isMatchOpen).map((match) => {
    const automaticMember = { id: profile.id, strategy };
    const [home, away] = botTip(automaticMember, match).split(":").map(Number);
    return [String(match.id), { home, away }];
  }));
}

async function syncOwnedAutomaticProfiles() {
  const cloud = window.TippRadarCloud;
  if (!cloud?.league || !cloud.session) return;
  const ownedProfiles = cloud.profiles.filter((profile) =>
    profile.account_user_id === cloud.session.user.id
    && (profile.is_primary || profile.profile_type === "child")
    && profile.auto_strategy
    && profile.auto_strategy !== "manual"
  );
  await Promise.all(ownedProfiles.map((profile) =>
    cloud.savePredictionsForProfile(
      profile.id,
      automaticProfileTips(profile, profile.auto_strategy)
    )
  ));
}

function allBotPredictions() {
  return teams.flatMap((team) => team.members.filter((member) => member.bot).flatMap((member) =>
    matches.filter(isMatchOpen).map((match) => {
      const [home, away] = botTip(member, match).split(":").map(Number);
      return {
        botId: member.id, botName: member.name, teamId: team.id,
        matchId: String(match.id), home, away,
        strategy: member.strategy === "cooper" ? "stat" : (member.strategy || "dog")
      };
    })
  ));
}

const participantRoleNames = {
  lead: "Team-Lead",
  adult: "Erwachsen",
  child: "Kind",
  bot: "Auto"
};

function profileForName(name) {
  return window.TippRadarCloud?.profiles?.find((profile) =>
    profile.display_name.trim().toLowerCase() === name.trim().toLowerCase()
  );
}

function participantRole(member) {
  if (member.bot) return "bot";
  return profileForName(member.name)?.profile_type || member.role || "adult";
}

function profileAutoStrategy(name) {
  return profileForName(name)?.auto_strategy || "manual";
}

function currentParticipants() {
  return teams.flatMap((team) => team.members.map((member) => ({
    id: member.id,
    name: member.name,
    initials: member.initials,
    color: member.bot ? "cooper-avatar" : "team-avatar",
    cooper: member.bot,
    role: participantRole(member),
    autoStrategy: member.bot ? (member.strategy || "dog") : profileAutoStrategy(member.name),
    team: team.name,
    teamColor: team.color
  })));
}

function deduplicateBots(sourceTeams) {
  const seenNames = new Set();
  let changed = false;
  const cleanedTeams = (Array.isArray(sourceTeams) ? sourceTeams : []).map((team) => ({
    ...team,
    members: (Array.isArray(team.members) ? team.members : []).filter((member) => {
      if (!member.bot) return true;
      const key = normalizedTeamName(member.name);
      if (!key || seenNames.has(key)) {
        changed = true;
        return false;
      }
      seenNames.add(key);
      return true;
    })
  }));
  return { teams: cleanedTeams, changed };
}

function fantasyStorageKey() {
  return `tippradar26-fantasy-${window.TippRadarCloud?.activeProfile?.id || "local"}`;
}

function positionLabel(position) {
  return ({
    Goalkeeper: "TOR",
    Defender: "ABWEHR",
    Midfielder: "MITTELFELD",
    Attacker: "STURM"
  })[position] || "FELD";
}

function playerOptionLabel(player) {
  const number = player.number ? ` #${player.number}` : "";
  return `${player.name} \u00b7 ${positionLabel(player.position)}${number}`;
}

function renderFantasyPicks() {
  const container = document.querySelector("#fantasy-picks");
  if (!container) return;
  const picksBySlot = Object.fromEntries(fantasyPicks.map((pick) => [Number(pick.slot), pick]));
  container.innerHTML = Array.from({ length: 5 }, (_, index) => {
    const slot = index + 1;
    const pick = picksBySlot[slot] || {};
    const teamOptions = [...new Set([pick.national_team, ...tournamentTeams].filter(Boolean))];
    const cached = squadCache[normalizedTeamName(pick.national_team || "")];
    const players = cached?.players || [];
    const playerOptions = pick.player_name && !players.some((player) => String(player.id) === String(pick.player_id))
      ? [{ id: pick.player_id, name: pick.player_name, position: pick.position }, ...players] : players;
    return `<label class="fantasy-pick">
      <span>${slot}</span>
      <select data-fantasy-team="${slot}">
        <option value="">Nationalmannschaft w&auml;hlen</option>
        ${teamOptions.map((team) => `<option value="${escapeHtml(team)}" ${team === pick.national_team ? "selected" : ""}>${escapeHtml(team)}</option>`).join("")}
      </select>
      <select data-fantasy-player="${slot}" ${pick.national_team ? "" : "disabled"}>
        <option value="">${pick.national_team ? (cached ? "Spieler w\u00e4hlen" : "Kader wird geladen") : "Zuerst Mannschaft w\u00e4hlen"}</option>
        ${playerOptions.map((player) => `<option value="${player.id}" ${String(player.id) === String(pick.player_id) ? "selected" : ""}>${escapeHtml(playerOptionLabel(player))}</option>`).join("")}
      </select>
    </label>`;
  }).join("");
  document.querySelector("#fantasy-counter").textContent = `${fantasyPicks.length} / 5 gew\u00e4hlt`;
  fantasyPicks.filter((pick) => pick.national_team && !squadCache[normalizedTeamName(pick.national_team)])
    .forEach((pick) => loadSquadForSlot(pick.slot, pick.national_team, pick.player_id));
}

function collectFantasyPicks() {
  return Array.from({ length: 5 }, (_, index) => {
    const slot = index + 1;
    const playerSelect = document.querySelector(`[data-fantasy-player="${slot}"]`);
    const teamSelect = document.querySelector(`[data-fantasy-team="${slot}"]`);
    const selectedPlayer = playerSelect.options[playerSelect.selectedIndex];
    const cached = squadCache[normalizedTeamName(teamSelect.value)];
    return {
      slot,
      player_id: playerSelect.value ? Number(playerSelect.value) : null,
      player_name: playerSelect.value
        ? (cached?.players?.find((player) => String(player.id) === playerSelect.value)?.name || "")
        : "",
      api_team_id: cached?.teamId || null,
      national_team: teamSelect.value
    };
  }).filter((pick) => pick.player_name || pick.national_team);
}

async function loadSquadForSlot(slot, teamName, selectedPlayerId = null) {
  if (!teamName || !window.TippRadarCloud?.session) return;
  const cacheKey = normalizedTeamName(teamName);
  const playerSelect = document.querySelector(`[data-fantasy-player="${slot}"]`);
  if (playerSelect) {
    playerSelect.disabled = true;
    playerSelect.innerHTML = '<option value="">Kader wird geladen</option>';
  }
  try {
    if (!squadCache[cacheKey]) {
      squadRequests[cacheKey] ||= window.TippRadarCloud.loadTeamSquad(teamName);
      squadCache[cacheKey] = await squadRequests[cacheKey];
    }
    const players = squadCache[cacheKey].players || [];
    const currentSelect = document.querySelector(`[data-fantasy-player="${slot}"]`);
    if (!currentSelect) return;
    currentSelect.disabled = !players.length;
    currentSelect.innerHTML = `<option value="">${players.length ? "Spieler w&auml;hlen" : "Kader noch nicht ver\u00f6ffentlicht"}</option>${players.map((player) =>
      `<option value="${player.id}" ${String(player.id) === String(selectedPlayerId) ? "selected" : ""}>${escapeHtml(playerOptionLabel(player))}</option>`
    ).join("")}`;
  } catch (error) {
    delete squadRequests[cacheKey];
    const currentSelect = document.querySelector(`[data-fantasy-player="${slot}"]`);
    if (currentSelect) currentSelect.innerHTML = '<option value="">Kader momentan nicht erreichbar</option>';
    showToast("Kader momentan nicht erreichbar", `${teamName}: ${error.message}`);
  }
}

function dateKey(value) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(value));
}

async function syncApiFootballEvents(schedule) {
  const cloud = window.TippRadarCloud;
  if (!cloud?.league || cloud.league.role !== "organizer") return;
  const now = Date.now();
  const finishedRecent = schedule.filter((match) => match.result
    && now - new Date(match.kickoff).getTime() < 47 * 60 * 60 * 1000);
  const dates = [...new Set(finishedRecent.map((match) => dateKey(match.kickoff)))];
  for (const date of dates) {
    try {
      const apiDay = await cloud.loadFootballDay(date);
      for (const match of finishedRecent.filter((item) => dateKey(item.kickoff) === date)) {
        const fixture = apiDay.fixtures.find((item) =>
          Math.abs(new Date(item.date).getTime() - new Date(match.kickoff).getTime()) < 90 * 60 * 1000
        );
        if (!fixture) continue;
        const data = await cloud.loadFootballEvents(fixture.id);
        const goals = new Map();
        data.events.filter((event) =>
          event.type === "Goal"
          && !/own goal|missed penalty|shootout/i.test(`${event.detail || ""} ${event.comments || ""}`)
          && event.player
        ).forEach((event) => {
          const key = String(event.playerId || `${event.player}-${event.team}`);
          const existing = goals.get(key) || {
            player_id: event.playerId || null,
            player_name: event.player,
            national_team: event.team,
            goals: 0
          };
          existing.goals += 1;
          goals.set(key, existing);
        });
        await cloud.replaceGoalEvents(match.id, [...goals.values()]);
      }
    } catch (error) {
      showToast("Torsch\u00fctzen-Sync pausiert", error.message);
    }
  }
}

function renderScorerMatches() {
  const select = document.querySelector("#scorer-match");
  if (!select) return;
  select.innerHTML = matches.map((match) =>
    `<option value="${match.id}">${escapeHtml(match.home)} - ${escapeHtml(match.away)}${match.result ? ` (${match.result})` : ""}</option>`
  ).join("");
}

function renderTipMatrix() {
  const table = document.querySelector("#tip-matrix");
  if (!table) return;
  const participants = currentParticipants();
  if (!participants.length) {
    table.innerHTML = `<tbody><tr><td class="matrix-empty">Lege unter <strong>Teams &amp; Spieler</strong> eure ersten Teilnehmer an.</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `
    <thead>
      <tr>
        <th class="match-column">Spiel</th>
        ${participants.map((participant) => `
          <th class="${participant.cooper ? "cooper-column" : ""} ${participant.you ? "you-column" : ""}">
            <span class="matrix-person">
              <i class="mini-avatar ${participant.color}" style="--team-color:${participant.teamColor}">${participant.initials}</i>
              <strong>${participant.name}</strong>
              <span class="participant-meta">
                <small class="role-badge ${participant.role}">${participantRoleNames[participant.role]}</small>
                ${participant.autoStrategy !== "manual" ? `<small class="role-badge bot">AUTO · ${participant.autoStrategy.toUpperCase()}</small>` : ""}
                <small class="team-badge" style="--team-color:${participant.teamColor}">${escapeHtml(participant.team)}</small>
              </span>
            </span>
          </th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${matches.map((match, index) => `
        <tr>
          <td class="match-column">
            <span class="matrix-match">
              <small>${match.time}</small>
              <strong><i>${match.homeFlag}</i>${match.home}</strong>
              <strong><i>${match.awayFlag}</i>${match.away}</strong>
              ${match.result ? `<b class="final-result">${match.result}</b>` : ""}
            </span>
          </td>
          ${participants.map((participant) => `
            <td class="${participant.cooper ? "cooper-column" : ""} ${participant.you ? "you-column" : ""}">
              <span class="matrix-tip ${tipForParticipant(participant, match, index) === "\u2013" ? "empty" : ""}">
                ${tipForParticipant(participant, match, index)}
              </span>
            </td>`).join("")}
        </tr>`).join("")}
    </tbody>`;
}

function renderTeams() {
  const grid = document.querySelector("#team-grid");
  if (!grid) return;
  const canManageTeams = !window.TippRadarCloud?.league
    || window.TippRadarCloud.league.role === "organizer";
  if (!teams.length) {
    grid.innerHTML = `
      <div class="empty-teams">
        <span class="empty-ball">&#9673;</span>
        <h2>Noch keine Teams angelegt</h2>
        <p>${canManageTeams ? "Starte mit eurem ersten Team. Danach kannst du Menschen oder kostenlose automatische Tipp-Spieler hinzuf&uuml;gen." : "Der Organisator hat noch keine Teams angelegt."}</p>
        ${canManageTeams ? '<button class="primary-button" data-action="open-team">Erstes Team anlegen</button>' : ""}
      </div>`;
    return;
  }
  grid.innerHTML = teams.map((team) => {
    const weightedTotal = team.members.reduce((sum, member) => sum + member.weight, 0);
    const score = teamScoreSummary[team.id] || { base: 0, matchBonus: 0, matchdayBonus: 0 };
    const totalScore = score.base + score.matchBonus + score.matchdayBonus;
    const matchRulePoints = Number(scoringRules.find((rule) => rule.criterion === "team_best_match")?.points || 0);
    const dayRulePoints = Number(scoringRules.find((rule) => rule.criterion === "team_best_matchday")?.points || 0);
    return `
      <article class="team-card" data-team-id="${team.id}" style="--team-color:${team.color}">
        <div class="team-card-head">
          <div><span class="team-rank" style="background:${team.color}">${team.name.slice(0, 2).toUpperCase()}</span><span><strong>${escapeHtml(team.name)}</strong><small>${(team.category || "family").toUpperCase()} &middot; ${team.members.length} Spieler</small></span></div>
          <div class="team-head-right">
            <span class="team-live-points"><strong>${totalScore.toFixed(1)}</strong> Teampunkte</span>
            ${canManageTeams ? `<div class="team-actions"><button data-action="toggle-player-form">+ Spieler</button><button class="danger-button" data-action="delete-team" title="Team l&ouml;schen">&times;</button></div>` : ""}
          </div>
        </div>
        <div class="player-form" hidden>
          <input data-field="player-name" type="text" maxlength="24" placeholder="Name des Spielers">
          <select data-field="player-type"><option value="human">Mensch</option><option value="bot">Automatischer Tipp-Spieler</option></select>
          <select data-field="player-role">
            <option value="lead">Team-Lead</option>
            <option value="adult">Erwachsene/r</option>
            <option value="child">Kind</option>
          </select>
          <select data-field="bot-strategy" hidden>
            <option value="dog">DOG-TIP / Zufallsprinzip</option>
            <option value="rank">RANK-TIP / FIFA-Rangliste</option>
            <option value="stat">STAT-TIP / Rangliste + Tormodell</option>
          </select>
          <button data-action="create-player">Hinzuf&uuml;gen</button>
        </div>
        <div class="team-members">
          ${team.members.length ? team.members.map((member, index) => `
            <div class="member-admin" data-member-id="${member.id}">
              <span class="member-position">${index + 1}</span>
              <span class="mini-avatar ${member.bot ? "cooper-avatar" : "team-avatar"}" style="--team-color:${team.color}">${member.initials}</span>
              <span class="member-name">
                <span class="member-name-line">
                  <strong>${escapeHtml(member.name)}</strong>
                  ${canManageTeams ? `<button class="member-edit" data-action="rename-player" title="Namen korrigieren" aria-label="${escapeHtml(member.name)} umbenennen">&#9998;</button>` : ""}
                </span>
                <span class="member-meta">
                  ${member.bot
                    ? `<small class="role-badge bot">Auto</small>`
                    : (canManageTeams ? `<select class="member-role-select" data-action="member-role" aria-label="Rolle von ${escapeHtml(member.name)}">
                        <option value="lead" ${participantRole(member) === "lead" ? "selected" : ""}>Team-Lead</option>
                        <option value="adult" ${participantRole(member) === "adult" ? "selected" : ""}>Erwachsen</option>
                        <option value="child" ${participantRole(member) === "child" ? "selected" : ""}>Kind</option>
                      </select>` : `<small class="role-badge ${participantRole(member)}">${participantRoleNames[participantRole(member)]}</small>`)}
                  <small class="team-badge" style="--team-color:${team.color}">${escapeHtml(team.name)}</small>
                  ${!member.bot && profileAutoStrategy(member.name) !== "manual"
                    ? `<small class="role-badge bot">AUTO · ${profileAutoStrategy(member.name).toUpperCase()}</small>`
                    : ""}
                </span>
                ${member.bot ? `<small>${botStrategyNames[member.strategy === "cooper" ? "stat" : (member.strategy || "dog")]}</small>` : ""}
              </span>
              <label class="weight-control">
                <span>Faktor <b>${member.weight.toFixed(2)}</b></span>
                <input type="range" min="0.75" max="1.25" step="0.05" value="${member.weight}" data-action="weight" ${canManageTeams ? "" : "disabled"}>
              </label>
              ${canManageTeams ? `<button class="member-delete" data-action="delete-player" title="Spieler l&ouml;schen">&times;</button>` : "<span></span>"}
            </div>`).join("") : `<div class="empty-members">Noch keine Spieler. F&uuml;ge den ersten Teilnehmer hinzu.</div>`}
        </div>
        <div class="team-card-foot">
          <span style="background:${team.color}"></span>
          Summe der Faktoren: <strong>${weightedTotal.toFixed(2)}</strong> / ${team.members.length}
          <em>${team.members.length ? "automatisch ausgeglichen" : "noch ohne Gewichtung"}</em>
        </div>
        <div class="team-bonus-strip">
          <span>Gewichtete Top 5 <strong>${score.base.toFixed(1)}</strong></span>
          <span>Bestes Team je Spiel <strong>${score.matchWins || 0} &times; ${matchRulePoints} = +${score.matchBonus.toFixed(1)}</strong></span>
          <span>Bestes Team je Spieltag <strong>${score.matchdayWins || 0} &times; ${dayRulePoints} = +${score.matchdayBonus.toFixed(1)}</strong></span>
        </div>
        <p class="team-score-explanation">Basis: Pro Spieltag z&auml;hlen die f&uuml;nf besten gewichteten Teilnehmer. Bei Punktgleichstand erhalten alle bestplatzierten Teams den jeweiligen Bonus. Die Einzelwerte stehen unter Rang &amp; Form.</p>
      </article>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initialsFor(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function persistTeams() {
  localStorage.setItem(teamStorageKey, JSON.stringify(teams));
  if (window.TippRadarCloud?.league) {
    window.TippRadarCloud.saveState(teams, scoringRules).catch(() => {
      showToast("Lokal gespeichert", "Die Cloud-Synchronisierung ist gerade nicht erreichbar.");
    });
  }
}

function rebalanceWeights(team, changedId, requestedValue) {
  const members = team.members;
  if (!members.length) return;
  if (members.length === 1) {
    members[0].weight = 1;
    return;
  }
  const changed = members.find((member) => member.id === changedId);
  const others = members.filter((member) => member.id !== changedId);
  const next = Math.max(0.75, Math.min(1.25, requestedValue));
  const otherTarget = members.length - next;
  const currentOtherTotal = others.reduce((sum, member) => sum + member.weight, 0);
  let difference = otherTarget - currentOtherTotal;
  changed.weight = next;

  for (let pass = 0; pass < 5 && Math.abs(difference) > 0.0001; pass += 1) {
    const adjustable = others.filter((member) => difference > 0 ? member.weight < 1.25 : member.weight > 0.75);
    if (!adjustable.length) break;
    const share = difference / adjustable.length;
    adjustable.forEach((member) => {
      const old = member.weight;
      member.weight = Math.max(0.75, Math.min(1.25, member.weight + share));
      difference -= member.weight - old;
    });
  }
  members.forEach((member) => { member.weight = Math.round(member.weight * 100) / 100; });
  const residual = Math.round((members.length - members.reduce((sum, member) => sum + member.weight, 0)) * 100) / 100;
  const receiver = others.find((member) => member.weight + residual >= 0.75 && member.weight + residual <= 1.25);
  if (receiver) receiver.weight = Math.round((receiver.weight + residual) * 100) / 100;
}

function renderRules() {
  const container = document.querySelector("#rule-inputs");
  if (!container) return;
  const cloudConnected = Boolean(window.TippRadarCloud?.league);
  const isOrganizer = !cloudConnected || window.TippRadarCloud.league.role === "organizer";
  container.innerHTML = scoringRules.map((rule) => `
    <label data-rule-id="${rule.id}">
      <span><i class="rule-dot ${rule.teamRule ? "team-bonus" : rule.id}"></i>${escapeHtml(rule.name)}${rule.teamRule ? "<small class=\"team-rule-label\">TEAM-BONUS</small>" : ""}</span>
      <input type="number" min="0" max="10" value="${rule.points}" data-action="rule-points" ${isOrganizer ? "" : "disabled"}>
      <small>Punkte</small>
      ${rule.locked || !isOrganizer ? "" : `<button class="rule-delete" data-action="delete-rule" aria-label="Kategorie l&ouml;schen">&times;</button>`}
    </label>`).join("");
  const total = scoringRules.filter((rule) => !rule.teamRule).reduce((sum, rule) => sum + Number(rule.points), 0);
  document.querySelector("#rule-count").textContent = `${scoringRules.length} Kategorien`;
  document.querySelector("#rule-total").textContent = `${total} Punkte`;
  document.querySelector("#save-rules").hidden = !isOrganizer;
  document.querySelector(".rules-footer .check-option input").disabled = !isOrganizer;
  const accessLabel = document.querySelector("#rules-access-label");
  accessLabel.textContent = isOrganizer
    ? "Nur du kannst \u00e4ndern"
    : `Gesperrt \u00b7 nur ${window.TippRadarCloud?.organizerName || "Organisator"}`;
  document.querySelector(".rules-card").classList.toggle("rules-readonly", !isOrganizer);
}

function showToast(title, message) {
  toast.querySelector("strong").textContent = title;
  toast.querySelector("small").textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function showView(name) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelector(`#${name}-view`).classList.add("active");
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  if (name === "ranking") requestAnimationFrame(() => renderRankChart("all"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderRanking() {
  const body = document.querySelector("#ranking-body");
  if (!body) return;
  const pointsByName = Object.fromEntries(profileStandings.map((profile) => [
    profile.display_name, {
      total: Number(profile.tipPoints || 0) + Number(profile.fantasyPoints || 0),
      fantasy: Number(profile.fantasyPoints || 0)
    }
  ]));
  const participants = currentParticipants().map((participant) => ({
    ...participant, points: pointsByName[participant.name] || { total: 0, fantasy: 0 }
  })).sort((a, b) => b.points.total - a.points.total);
  body.innerHTML = participants.length ? participants.map((participant, index) => `
    <tr class="${participant.cooper ? "cooper-row" : ""}">
      <td><b class="rank-number">${index + 1}</b></td>
      <td>
        <span class="mini-avatar ${participant.color}" style="--team-color:${participant.teamColor}">${participant.initials}</span>
        <strong>${escapeHtml(participant.name)}</strong>
        <span class="participant-meta">
          <small class="role-badge ${participant.role}">${participantRoleNames[participant.role]}</small>
          ${participant.autoStrategy !== "manual" ? `<small class="role-badge bot">AUTO · ${participant.autoStrategy.toUpperCase()}</small>` : ""}
          <small class="team-badge" style="--team-color:${participant.teamColor}">${escapeHtml(participant.team)}</small>
        </span>
      </td>
      <td>${participant.points.total - participant.points.fantasy}</td>
      <td>${participant.points.fantasy}</td>
      <td><strong>${participant.points.total}</strong></td>
    </tr>`).join("") : `
    <tr><td colspan="5" class="ranking-empty">Noch keine Spieler angelegt. Die Rangliste f&uuml;llt sich mit eurer Runde.</td></tr>`;
}

function renderPointDetails() {
  const list = document.querySelector("#points-ledger-list");
  const startLabel = document.querySelector("#ledger-scoring-start");
  if (!list || !startLabel) return;
  startLabel.textContent = formatScoringStart(scoringStart);
  const details = pointDetails || {
    profiles: [], profileTips: [], fantasy: [], bots: [],
    schedule: [], teamMatches: [], teamDays: []
  };
  const liveById = Object.fromEntries(tournamentSchedule.map((match) => [String(match.id), match]));
  const cloudScheduleAvailable = details.schedule.length > 0;
  const schedule = (cloudScheduleAvailable ? details.schedule : tournamentSchedule.map((match) => ({
    match_id: String(match.id), kickoff: match.kickoff, matchday: String(match.matchday),
    home_team: match.home, away_team: match.away
  }))).map((match) => ({
    ...match,
    result: liveById[String(match.match_id)]?.result || match.result || null
  }));

  const profileNames = Object.fromEntries(details.profiles.map((profile) => [profile.id, profile.display_name]));
  const fantasyByKey = Object.fromEntries(details.fantasy.map((row) => [
    `${row.profile_id}:${row.match_id}`,
    Number(row.goal_points || 0) + Number(row.win_points || 0)
  ]));
  const teamNames = Object.fromEntries(teams.map((team) => [team.id, team.name]));
  const evaluatedMatchIds = new Set([
    ...details.profileTips.filter((row) => row.points !== null).map((row) => String(row.match_id)),
    ...details.bots.filter((row) => row.points !== null).map((row) => String(row.match_id)),
    ...details.teamMatches.map((row) => String(row.match_id))
  ]);
  const rows = schedule
    .filter((match) => match.result || evaluatedMatchIds.has(String(match.match_id)))
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
  if (!rows.length) {
    list.innerHTML = `<div class="ledger-empty">${cloudScheduleAvailable
      ? "Der Spielplan ist synchronisiert, aber es liegt noch kein ausgewertetes Ergebnis vor."
      : "Der Spielplan wird noch synchronisiert. Bitte als Organisator auf Punkte aktualisieren klicken."}</div>`;
    return;
  }

  function matchBreakdown(match) {
    const counted = isMatchCounted(match);
    const profileRows = details.profileTips
      .filter((tip) => String(tip.match_id) === String(match.match_id))
      .map((tip) => {
        const tipPoints = counted ? Number(tip.points || 0) : 0;
        const top5 = counted ? Number(fantasyByKey[`${tip.profile_id}:${tip.match_id}`] || 0) : 0;
        return {
          name: profileNames[tip.profile_id] || "Unbekannt",
          tip: `${tip.home_score}:${tip.away_score}`,
          tipPoints, top5, total: tipPoints + top5
        };
      });
    const botRows = details.bots
      .filter((tip) => String(tip.match_id) === String(match.match_id))
      .map((tip) => ({
        name: `${tip.bot_name} (Auto)`, tip: `${tip.home_score}:${tip.away_score}`,
        tipPoints: counted ? Number(tip.points || 0) : 0, top5: 0,
        total: counted ? Number(tip.points || 0) : 0
      }));
    const participantRows = [...profileRows, ...botRows].sort((a, b) => b.total - a.total);
    const teamRows = details.teamMatches
      .filter((row) => String(row.match_id) === String(match.match_id))
      .map((row) => ({
        name: teamNames[row.team_id] || row.team_id,
        base: counted ? Number(row.weighted_points || 0) : 0,
        bonus: counted ? Number(row.match_bonus || 0) : 0
      }));
    return {
      match, counted, participantRows, teamRows,
      tipPoints: participantRows.reduce((sum, row) => sum + row.tipPoints, 0),
      top5: participantRows.reduce((sum, row) => sum + row.top5, 0),
      teamBase: teamRows.reduce((sum, row) => sum + row.base, 0),
      matchBonus: teamRows.reduce((sum, row) => sum + row.bonus, 0)
    };
  }

  const matchesByDay = Object.values(rows.reduce((groups, match) => {
    const key = String(match.matchday);
    groups[key] ||= { matchday: key, matches: [], latest: 0 };
    const breakdown = matchBreakdown(match);
    groups[key].matches.push(breakdown);
    groups[key].latest = Math.max(groups[key].latest, new Date(match.kickoff).getTime());
    return groups;
  }, {})).sort((a, b) => b.latest - a.latest);

  list.innerHTML = matchesByDay.length ? `
    ${cloudScheduleAvailable ? "" : '<div class="ledger-sync-note">Live-Spielplan geladen. Die zentrale Punkteauswertung wird noch synchronisiert.</div>'}
    <div class="ledger-table ledger-table-head" aria-hidden="true">
      <span>Spieltag / Spiel</span><span>TN-Tipps</span><span>TN Top 5</span><span>Team Top 5</span><span>Spielbonus</span><span>ST-Bonus</span>
    </div>
    ${matchesByDay.map((day, dayIndex) => {
      const dayRows = details.teamDays
        .filter((row) => String(row.matchday) === day.matchday)
        .map((row) => ({
          name: teamNames[row.team_id] || row.team_id,
          base: Number(row.weighted_points || 0),
          bonus: Number(row.bonus_points || 0)
        }));
      const totals = day.matches.reduce((sum, item) => ({
        tips: sum.tips + item.tipPoints,
        top5: sum.top5 + item.top5,
        teamBase: sum.teamBase + item.teamBase,
        bonus: sum.bonus + item.matchBonus
      }), { tips: 0, top5: 0, teamBase: 0, bonus: 0 });
      const dayBonus = dayRows.reduce((sum, row) => sum + row.bonus, 0);
      return `
        <details class="ledger-day" ${dayIndex === 0 ? "open" : ""}>
          <summary class="ledger-table ledger-day-row">
            <span><i></i><strong>Spieltag ${escapeHtml(day.matchday)}</strong><small>${day.matches.length} Spiele</small></span>
            <span>${totals.tips}</span><span>${totals.top5}</span><span>${totals.teamBase.toFixed(1)}</span>
            <span>+${totals.bonus.toFixed(1)}</span><strong>+${dayBonus.toFixed(1)}</strong>
          </summary>
          <div class="ledger-day-content">
            ${day.matches.map((item) => {
              return `
                <details class="ledger-game ${item.counted ? "" : "excluded"}">
                  <summary class="ledger-table ledger-game-row">
                    <span><i></i><strong>${escapeHtml(item.match.home_team)} - ${escapeHtml(item.match.away_team)}</strong><small>${item.counted ? "Einzelspiel" : "Au\u00dfer Wertung"}</small></span>
                    <span>${item.tipPoints}</span><span>${item.top5}</span><span>${item.teamBase.toFixed(1)}</span>
                    <span>+${item.matchBonus.toFixed(1)}</span><strong>&ndash;</strong>
                  </summary>
                  <div class="ledger-detail-grid">
                    <section>
                      <h4>Teilnehmer</h4>
                      <div class="ledger-detail-table">
                        <div class="ledger-detail-head"><span>Name</span><span>Tipp</span><span>Tipps</span><span>Top 5</span><span>Gesamt</span></div>
                        ${item.participantRows.length ? item.participantRows.map((row) => `
                          <div><span>${escapeHtml(row.name)}</span><span>${row.tip}</span><span>${row.tipPoints}</span><span>${row.top5}</span><strong>${row.total}</strong></div>
                        `).join("") : '<p class="ledger-empty">Keine Tipps f&uuml;r dieses Spiel.</p>'}
                      </div>
                    </section>
                    <section>
                      <h4>Teams</h4>
                      <div class="ledger-detail-table team-detail-table">
                        <div class="ledger-detail-head"><span>Team</span><span></span><span>Top 5</span><span>Spielbonus</span><span>Gesamt</span></div>
                        ${item.teamRows.length ? item.teamRows.map((row) => `
                          <div><span>${escapeHtml(row.name)}</span><span></span><span>${row.base.toFixed(1)}</span><span>+${row.bonus.toFixed(1)}</span><strong>${(row.base + row.bonus).toFixed(1)}</strong></div>
                        `).join("") : '<p class="ledger-empty">Keine Teamwertung f&uuml;r dieses Spiel.</p>'}
                      </div>
                    </section>
                  </div>
                </details>`;
            }).join("")}
            <div class="ledger-day-bonus">
              <strong>Spieltagbonus</strong>
              ${dayRows.length ? dayRows.map((row) => `
                <span>${escapeHtml(row.name)}: Top-5-Summe ${row.base.toFixed(1)} / Bonus <b>+${row.bonus.toFixed(1)}</b></span>
              `).join("") : "<span>Noch keine Spieltagwertung vorhanden.</span>"}
            </div>
          </div>
        </details>`;
    }).join("")}
  ` : '<div class="ledger-empty">Noch kein Spiel wurde beendet.</div>';
}

function renderRankChart(range = "all") {
  const svg = document.querySelector("#rank-chart");
  if (!svg) return;
  const rankSeries = [];
  if (!currentParticipants().length) {
    svg.innerHTML = `<text x="450" y="155" text-anchor="middle" class="chart-empty-title">Noch kein Rangverlauf</text><text x="450" y="180" text-anchor="middle" class="chart-empty-copy">Nach den ersten Spielen werden hier eure Aufholjagden sichtbar.</text>`;
    document.querySelector("#chart-legend").innerHTML = "";
    return;
  }
  const start = range === "recent" ? 2 : 0;
  const labels = ["ST 1", "ST 2", "ST 3", "ST 4", "ST 5", "ST 6"].slice(start);
  const width = 900, height = 330, left = 48, right = 42, top = 24, bottom = 42;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (index) => left + (index * plotWidth / (labels.length - 1));
  const y = (rank) => top + ((rank - 1) * plotHeight / 5);
  let markup = "";

  for (let rank = 1; rank <= 6; rank += 1) {
    markup += `<line x1="${left}" y1="${y(rank)}" x2="${width - right}" y2="${y(rank)}" class="grid-line"/>`;
    markup += `<text x="12" y="${y(rank) + 4}" class="rank-label">${rank}</text>`;
  }
  labels.forEach((label, index) => {
    markup += `<text x="${x(index)}" y="${height - 12}" text-anchor="middle" class="day-label">${label}</text>`;
  });
  rankSeries.forEach((series) => {
    const values = series.values.slice(start);
    const points = values.map((rank, index) => `${x(index)},${y(rank)}`).join(" ");
    markup += `<g data-chart-series="${series.name}"><polyline points="${points}" fill="none" stroke="${series.color}" class="rank-line ${series.cooper ? "cooper-line" : ""}"/>`;
    values.forEach((rank, index) => {
      markup += `<circle cx="${x(index)}" cy="${y(rank)}" r="${series.cooper ? 7 : 5}" fill="${series.color}" class="rank-dot"/>`;
    });
    const last = values.length - 1;
    markup += `<text x="${x(last) + 12}" y="${y(values[last]) + 4}" fill="${series.color}" class="end-label">${series.name}</text></g>`;
  });
  svg.innerHTML = markup;

  document.querySelector("#chart-legend").innerHTML = rankSeries.map((series) =>
    `<button class="${series.cooper ? "cooper-legend" : ""}" data-series="${series.name}"><i style="background:${series.color}"></i>${series.name}</button>`
  ).join("");

  document.querySelectorAll("#chart-legend button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSeries = selectedSeries === button.dataset.series ? null : button.dataset.series;
      document.querySelectorAll("#chart-legend button").forEach((item) => item.classList.toggle("muted", selectedSeries && item.dataset.series !== selectedSeries));
      document.querySelectorAll("[data-chart-series]").forEach((group) => group.classList.toggle("series-muted", selectedSeries && group.dataset.chartSeries !== selectedSeries));
    });
  });
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-range]").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  renderRankChart(button.dataset.range);
}));

document.querySelector("#save-tips").addEventListener("click", async () => {
  savedTips = collectTips();
  localStorage.setItem(storageKey, JSON.stringify(savedTips));
  if (window.TippRadarCloud?.league) {
    try {
      await window.TippRadarCloud.savePredictions(savedTips);
    } catch (error) {
      showToast("Nicht zentral gespeichert", error.message.includes("policy") ? "Mindestens ein Tipp ist bereits geschlossen." : error.message);
      return;
    }
  }
  updateProgress();
  showToast("Tipps gespeichert", "Viel Erfolg!");
});

document.querySelector("#save-fantasy-picks").addEventListener("click", async () => {
  const picks = collectFantasyPicks();
  if (picks.some((pick) => !pick.player_name || !pick.national_team)) {
    showToast("Auswahl unvollst\u00e4ndig", "Bitte bei jeder Auswahl Spieler und Nationalmannschaft angeben.");
    return;
  }
  const duplicate = picks.find((pick, index) =>
    picks.findIndex((other) => other.player_name.toLowerCase() === pick.player_name.toLowerCase()) !== index
  );
  if (duplicate) {
    showToast("Spieler doppelt gew\u00e4hlt", "Jeder Spieler darf pro Profil nur einmal vorkommen.");
    return;
  }
  try {
    if (window.TippRadarCloud?.league) await window.TippRadarCloud.saveFantasyPicks(picks);
    fantasyPicks = picks;
    localStorage.setItem(fantasyStorageKey(), JSON.stringify(picks));
    renderFantasyPicks();
    showToast("Top 5 gespeichert", `${picks.length} Spieler sind f\u00fcr dieses Profil ausgew\u00e4hlt.`);
  } catch (error) {
    showToast("Top 5 nicht gespeichert", error.message);
  }
});
document.querySelector("#fantasy-picks").addEventListener("change", (event) => {
  const slot = event.target.dataset.fantasyTeam;
  if (!slot) return;
  loadSquadForSlot(Number(slot), event.target.value);
});

function openTeamCreator() {
  const creator = document.querySelector("#team-creator");
  creator.hidden = false;
  creator.scrollIntoView({ behavior: "smooth", block: "center" });
}

document.querySelector("#open-team-creator").addEventListener("click", openTeamCreator);
document.querySelector("#close-team-creator").addEventListener("click", () => {
  document.querySelector("#team-creator").hidden = true;
});
document.querySelector("#create-team").addEventListener("click", () => {
  const input = document.querySelector("#team-name");
  const name = input.value.trim();
  if (!name) {
    showToast("Teamname fehlt", "Bitte gib eurem Team einen Namen.");
    input.focus();
    return;
  }
  teams.push({
    id: makeId("team"),
    name,
    category: document.querySelector("#team-category").value,
    color: document.querySelector("#team-color").value,
    members: []
  });
  persistTeams();
  renderTeams();
  input.value = "";
  document.querySelector("#team-creator").hidden = true;
  showToast(`${name} angelegt`, "Jetzt kannst du Spieler hinzuf\u00fcgen.");
});

document.querySelector("#team-grid").addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === "open-team") {
    openTeamCreator();
    return;
  }
  const card = actionButton.closest("[data-team-id]");
  if (!card) return;
  const team = teams.find((item) => item.id === card.dataset.teamId);
  if (action === "toggle-player-form") {
    const form = card.querySelector(".player-form");
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector("input").focus();
  }
  if (action === "create-player") {
    const nameInput = card.querySelector('[data-field="player-name"]');
    const name = nameInput.value.trim();
    if (!name) {
      showToast("Spielername fehlt", "Bitte gib einen Namen ein.");
      return;
    }
    const bot = card.querySelector('[data-field="player-type"]').value === "bot";
    const strategy = bot ? card.querySelector('[data-field="bot-strategy"]').value : null;
    const role = bot ? "bot" : card.querySelector('[data-field="player-role"]').value;
    team.members.push({ id: makeId("player"), name, initials: initialsFor(name), bot, role, strategy, weight: 1 });
    persistTeams();
    renderTeams();
    renderTipMatrix();
    renderRanking();
    renderRankChart();
    showToast(`${name} hinzugef\u00fcgt`, `Faktor 1,00 in ${team.name}`);
    if (bot && window.TippRadarCloud?.league?.role === "organizer") {
      window.TippRadarCloud.saveBotPredictions(allBotPredictions()).catch(() => {});
    }
  }
  if (action === "rename-player") {
    const memberRow = actionButton.closest("[data-member-id]");
    const member = team.members.find((item) => item.id === memberRow.dataset.memberId);
    const previousName = member.name;
    const nextName = window.prompt("Neuer Spielername", previousName)?.trim();
    if (!nextName || nextName === previousName) return;
    const duplicate = teams.some((item) => item.members.some((candidate) =>
      candidate.id !== member.id
      && candidate.name.trim().toLowerCase() === nextName.toLowerCase()
    ));
    if (duplicate) {
      showToast("Name bereits vorhanden", "Jeder Teilnehmername muss eindeutig sein.");
      return;
    }

    const profile = profileForName(previousName);
    const applyRename = () => {
      member.name = nextName;
      member.initials = initialsFor(nextName);
      if (leaguePredictions[previousName]) {
        leaguePredictions[nextName] = leaguePredictions[previousName];
        delete leaguePredictions[previousName];
      }
      persistTeams();
      renderTeams();
      renderTipMatrix();
      renderRanking();
      updateAccountUi();
      showToast("Name korrigiert", `${previousName} hei\u00dft jetzt ${nextName}.`);
    };

    if (profile && window.TippRadarCloud?.renameProfile) {
      window.TippRadarCloud.renameProfile(profile.id, nextName)
        .then(applyRename)
        .catch((error) => showToast("Name nicht ge\u00e4ndert", error.message));
    } else {
      applyRename();
    }
  }
  if (action === "delete-player") {
    const memberRow = actionButton.closest("[data-member-id]");
    team.members = team.members.filter((member) => member.id !== memberRow.dataset.memberId);
    team.members.forEach((member) => { member.weight = 1; });
    persistTeams();
    renderTeams();
    renderTipMatrix();
    renderRanking();
    renderRankChart();
  }
  if (action === "delete-team") {
    teams = teams.filter((item) => item.id !== team.id);
    persistTeams();
    renderTeams();
    renderTipMatrix();
    renderRanking();
    renderRankChart();
    showToast("Team gel\u00f6scht", `${team.name} wurde entfernt.`);
  }
});

document.querySelector("#team-grid").addEventListener("change", (event) => {
  if (event.target.dataset.field === "player-type") {
    const form = event.target.closest(".player-form");
    const strategy = form.querySelector('[data-field="bot-strategy"]');
    const role = form.querySelector('[data-field="player-role"]');
    strategy.hidden = event.target.value !== "bot";
    role.hidden = event.target.value === "bot";
    return;
  }
  if (event.target.dataset.action === "member-role") {
    const card = event.target.closest("[data-team-id]");
    const row = event.target.closest("[data-member-id]");
    const team = teams.find((item) => item.id === card.dataset.teamId);
    const member = team.members.find((item) => item.id === row.dataset.memberId);
    const previousRole = participantRole(member);
    member.role = event.target.value;
    persistTeams();

    const profile = profileForName(member.name);
    if (profile && window.TippRadarCloud?.updateProfileType) {
      window.TippRadarCloud.updateProfileType(profile.id, member.role)
        .then(() => {
          renderTeams();
          renderTipMatrix();
          renderRanking();
          showToast("Rolle ge\u00e4ndert", `${member.name} ist jetzt ${participantRoleNames[member.role]}.`);
        })
        .catch((error) => {
          member.role = previousRole;
          persistTeams();
          renderTeams();
          showToast("Rolle nicht ge\u00e4ndert", error.message);
        });
    } else {
      renderTeams();
      renderTipMatrix();
      renderRanking();
      showToast("Rolle ge\u00e4ndert", `${member.name} ist jetzt ${participantRoleNames[member.role]}.`);
    }
    return;
  }
  if (event.target.dataset.action !== "weight") return;
  const card = event.target.closest("[data-team-id]");
  const row = event.target.closest("[data-member-id]");
  const team = teams.find((item) => item.id === card.dataset.teamId);
  rebalanceWeights(team, row.dataset.memberId, Number(event.target.value));
  persistTeams();
  renderTeams();
});

document.querySelector("#rule-inputs").addEventListener("input", (event) => {
  if (window.TippRadarCloud?.league && window.TippRadarCloud.league.role !== "organizer") return;
  if (event.target.dataset.action !== "rule-points") return;
  const rule = scoringRules.find((item) => item.id === event.target.closest("[data-rule-id]").dataset.ruleId);
  rule.points = Number(event.target.value || 0);
  renderRules();
});
document.querySelector("#rule-inputs").addEventListener("click", (event) => {
  if (window.TippRadarCloud?.league && window.TippRadarCloud.league.role !== "organizer") return;
  const button = event.target.closest('[data-action="delete-rule"]');
  if (!button) return;
  const id = button.closest("[data-rule-id]").dataset.ruleId;
  scoringRules = scoringRules.filter((rule) => rule.id !== id);
  renderRules();
});
document.querySelector("#save-rules").addEventListener("click", () => {
  if (window.TippRadarCloud?.league && window.TippRadarCloud.league.role !== "organizer") {
    showToast("Regeln gesperrt", `Nur ${window.TippRadarCloud.organizerName || "der Organisator"} kann sie \u00e4ndern.`);
    return;
  }
  localStorage.setItem(ruleStorageKey, JSON.stringify(scoringRules));
  if (window.TippRadarCloud?.league) {
    window.TippRadarCloud.saveState(teams, scoringRules).catch(() => {
      showToast("Lokal gespeichert", "Die Cloud-Synchronisierung ist gerade nicht erreichbar.");
    });
  }
  showToast("Regeln gespeichert", "G\u00fcltig f\u00fcr diese Tipprunde");
});

function setAccountPanel(name) {
  ["cloud-unconfigured", "cloud-login", "cloud-onboarding", "cloud-account"].forEach((id) => {
    document.querySelector(`#${id}`).hidden = id !== name;
  });
}

function updateAccountUi() {
  const cloud = window.TippRadarCloud;
  if (!cloud?.configured) {
    document.querySelector("#account-name").textContent = "Lokal";
    document.querySelector("#account-status").textContent = "Nur auf diesem Ger\u00e4t";
    setAccountPanel("cloud-unconfigured");
  } else if (!cloud.session) {
    document.querySelector("#account-name").textContent = "Anmelden";
    document.querySelector("#account-status").textContent = "Gemeinsam tippen";
    setAccountPanel("cloud-login");
  } else if (!cloud.league) {
    document.querySelector("#account-name").textContent = cloud.session.user.email;
    document.querySelector("#account-status").textContent = "Runde ausw\u00e4hlen";
    setAccountPanel("cloud-onboarding");
  } else {
    document.querySelector("#account-name").textContent = cloud.activeProfile?.display_name || cloud.league.displayName;
    document.querySelector("#account-status").textContent = cloud.league.name;
    document.querySelector("#cloud-league-name").textContent = cloud.league.name;
    document.querySelector("#cloud-invite-code").textContent = cloud.league.inviteCode;
    document.querySelector("#cloud-organizer-name").textContent =
      `${cloud.organizerName || "Unbekannt"}${cloud.league.role === "organizer" ? " (du)" : ""}`;
    document.querySelector("#scorer-admin").hidden = cloud.league.role !== "organizer";
    document.querySelector("#open-team-creator").hidden = cloud.league.role !== "organizer";
    const ownedProfiles = cloud.profiles.filter((profile) =>
      profile.account_user_id === cloud.session.user.id
      && (profile.is_primary || profile.profile_type === "child")
    );
    const primaryProfile = ownedProfiles.find((profile) => profile.is_primary);
    document.querySelector("#current-account-type").value = cloud.league.accountType;
    document.querySelector('#current-account-type option[value="family"]').disabled =
      primaryProfile?.profile_type !== "lead" && cloud.league.role !== "organizer";
    const profileSelect = document.querySelector("#active-profile");
    profileSelect.innerHTML = ownedProfiles.map((profile) =>
      {
        const team = teams.find((item) => item.members.some((member) =>
          member.name.trim().toLowerCase() === profile.display_name.trim().toLowerCase()
        ));
        const role = participantRoleNames[profile.profile_type] || "Erwachsen";
        return `<option value="${profile.id}" ${profile.id === cloud.activeProfile?.id ? "selected" : ""}>${escapeHtml(profile.display_name)} / ${role}${team ? ` / ${escapeHtml(team.name)}` : " / noch ohne Team"}</option>`;
      }
    ).join("");
    const autoSelect = document.querySelector("#profile-auto-strategy");
    autoSelect.value = cloud.activeProfile?.auto_strategy || "manual";
    document.querySelector("#profile-auto-field").hidden = cloud.league.accountType !== "family";
    document.querySelector(".profile-auto-note").hidden = cloud.league.accountType !== "family";
    document.querySelector("#family-profile-creator").hidden = cloud.league.accountType !== "family";
    document.querySelector(".profile-access-note").hidden = cloud.league.accountType !== "family";
    const startCard = document.querySelector(".scoring-start-card");
    startCard.classList.toggle("readonly", cloud.league.role !== "organizer");
    document.querySelector("#scoring-start").value = toDateTimeLocal(scoringStart);
    document.querySelector("#scoring-start-status").textContent = formatScoringStart(scoringStart);
    setAccountPanel("cloud-account");
  }
}

async function syncFromCloud() {
  const cloud = window.TippRadarCloud;
  if (!cloud?.league) return;
  const [state, cloudTips, cloudTeamScores, allTips, cloudFantasy, standings, details] = await Promise.all([
    cloud.loadState(), cloud.loadPredictions(), cloud.loadTeamScores(), cloud.loadLeaguePredictions(),
    cloud.loadFantasyPicks(), cloud.loadStandings(), cloud.loadPointDetails()
  ]);
  if (state) {
    const cleanedState = deduplicateBots(Array.isArray(state.teams) ? state.teams : teams);
    teams = cleanedState.teams;
    scoringRules = Array.isArray(state.scoring_rules) && state.scoring_rules.length ? state.scoring_rules : scoringRules;
    scoringStart = state.scoring_start || null;
    const storedRules = JSON.stringify(scoringRules);
    ensureTeamBonusRules();
    if (cloud.league.role === "organizer" && (JSON.stringify(scoringRules) !== storedRules || cleanedState.changed)) {
      await cloud.saveState(teams, scoringRules);
    }
    localStorage.setItem(teamStorageKey, JSON.stringify(teams));
    localStorage.setItem(ruleStorageKey, JSON.stringify(scoringRules));
  }
  savedTips = cloudTips;
  teamScoreSummary = cloudTeamScores;
  leaguePredictions = allTips;
  fantasyPicks = cloudFantasy;
  profileStandings = standings;
  pointDetails = details;
  if (cloud.activeProfile?.display_name) {
    leaguePredictions[cloud.activeProfile.display_name] ||= {};
    Object.entries(cloudTips).forEach(([matchId, tip]) => {
      leaguePredictions[cloud.activeProfile.display_name][matchId] = `${tip.home}:${tip.away}`;
    });
  }
  localStorage.setItem(storageKey, JSON.stringify(savedTips));
  renderTeams();
  renderRules();
  renderMatches();
  renderTipMatrix();
  renderRanking();
  renderPointDetails();
  renderFantasyPicks();
  updateAccountUi();
}

async function initializeCloud() {
  try {
    await window.TippRadarCloud?.init();
    updateAccountUi();
    await syncFromCloud();
    if (window.TippRadarCloud?.league) await loadOpenLigaMatches();
    if (window.TippRadarCloud?.league?.role === "organizer") {
      await window.TippRadarCloud.saveBotPredictions(allBotPredictions());
    }
  } catch (error) {
    showToast("Cloud nicht erreichbar", "Die App arbeitet vorerst lokal weiter.");
  }
}

document.querySelector("#account-button").addEventListener("click", () => {
  updateAccountUi();
  document.querySelector("#account-modal").hidden = false;
});
document.querySelector("#account-close").addEventListener("click", () => {
  document.querySelector("#account-modal").hidden = true;
});
document.querySelector("#account-modal").addEventListener("click", (event) => {
  if (event.target.id === "account-modal") event.currentTarget.hidden = true;
});
document.querySelector("#send-magic-link").addEventListener("click", async () => {
  const email = document.querySelector("#login-email").value.trim();
  if (!email) return showToast("E-Mail fehlt", "Bitte gib deine E-Mail-Adresse ein.");
  try {
    await window.TippRadarCloud.sendMagicLink(email);
    showToast("E-Mail ist unterwegs", "Bitte den Anmeldelink im Postfach anklicken.");
  } catch (error) {
    showToast("Anmeldung fehlgeschlagen", error.message);
  }
});
document.querySelector("#join-league").addEventListener("click", async () => {
  const displayName = document.querySelector("#member-name").value.trim();
  const code = document.querySelector("#join-code").value.trim();
  if (!displayName || !code) return showToast("Angaben fehlen", "Name und Einladungscode werden ben\u00f6tigt.");
  try {
    await window.TippRadarCloud.joinLeague(code, displayName);
    await window.TippRadarCloud.ensurePrimaryProfile(document.querySelector("#account-type").value);
    updateAccountUi();
    await syncFromCloud();
    showToast("Willkommen in der Runde", window.TippRadarCloud.league.name);
  } catch (error) {
    showToast("Beitritt fehlgeschlagen", error.message);
  }
});
document.querySelector("#create-league").addEventListener("click", async () => {
  const displayName = document.querySelector("#member-name").value.trim();
  const leagueName = document.querySelector("#league-name").value.trim();
  const code = document.querySelector("#new-invite-code").value.trim();
  if (!displayName || !leagueName || !code) return showToast("Angaben fehlen", "Bitte alle drei Felder ausf\u00fcllen.");
  try {
    await window.TippRadarCloud.createLeague(leagueName, code, displayName);
    await window.TippRadarCloud.ensurePrimaryProfile(document.querySelector("#account-type").value);
    updateAccountUi();
    await window.TippRadarCloud.saveState(teams, scoringRules);
    showToast("Tipprunde erstellt", `Einladungscode: ${code.toUpperCase()}`);
  } catch (error) {
    showToast("Erstellen fehlgeschlagen", error.message);
  }
});
document.querySelector("#active-profile").addEventListener("change", async (event) => {
  window.TippRadarCloud.selectProfile(event.target.value);
  await syncFromCloud();
  showToast("Profil gewechselt", `${window.TippRadarCloud.activeProfile.display_name} tippt jetzt.`);
});
document.querySelector("#profile-auto-strategy").addEventListener("change", async (event) => {
  const cloud = window.TippRadarCloud;
  const profile = cloud.activeProfile;
  const strategy = event.target.value;
  if (!profile) return;
  if (strategy !== "manual" && !window.confirm(
    `Offene Tipps von ${profile.display_name} werden jetzt automatisch neu gesetzt. Fortfahren?`
  )) {
    event.target.value = profile.auto_strategy || "manual";
    return;
  }
  try {
    await cloud.setProfileAutoStrategy(profile.id, strategy);
    if (strategy !== "manual") {
      await cloud.savePredictionsForProfile(profile.id, automaticProfileTips(profile, strategy));
    }
    await syncFromCloud();
    showToast(
      strategy === "manual" ? "Manuelles Tippen aktiv" : "Auto-Tipper aktiv",
      strategy === "manual"
        ? `${profile.display_name} tippt wieder selbst.`
        : `${profile.display_name} tippt jetzt nach ${botStrategyNames[strategy]}.`
    );
  } catch (error) {
    event.target.value = profile.auto_strategy || "manual";
    showToast("Tippmodus nicht ge\u00e4ndert", error.message);
  }
});
document.querySelector("#current-account-type").addEventListener("change", async (event) => {
  try {
    await window.TippRadarCloud.ensurePrimaryProfile(event.target.value);
    updateAccountUi();
    showToast("Kontoart ge\u00e4ndert", event.target.value === "family" ? "Du kannst jetzt Kinderprofile anlegen." : "Das Hauptprofil bleibt aktiv.");
  } catch (error) {
    showToast("Kontoart nicht ge\u00e4ndert", error.message);
  }
});
document.querySelector("#add-family-profile").addEventListener("click", async () => {
  const input = document.querySelector("#family-profile-name");
  const name = input.value.trim();
  if (!name) return showToast("Name fehlt", "Bitte gib den Namen des Kindes ein.");
  try {
    await window.TippRadarCloud.addFamilyProfile(name);
    input.value = "";
    updateAccountUi();
    await syncFromCloud();
    showToast("Kinderprofil angelegt", `Der Team-Lead kann jetzt f\u00fcr ${name} tippen.`);
  } catch (error) {
    showToast("Profil nicht angelegt", error.message);
  }
});
document.querySelector("#save-scorer").addEventListener("click", async () => {
  const matchId = document.querySelector("#scorer-match").value;
  const player = document.querySelector("#scorer-player").value.trim();
  const team = document.querySelector("#scorer-team").value.trim();
  const goals = Number(document.querySelector("#scorer-goals").value || 0);
  if (!matchId || !player || !team || goals < 1) {
    showToast("Angaben fehlen", "Spiel, Torsch\u00fctze, Mannschaft und Tore werden ben\u00f6tigt.");
    return;
  }
  try {
    await window.TippRadarCloud.recordPlayerEvent(matchId, player, team, goals);
    const match = matches.find((item) => String(item.id) === String(matchId));
    if (match?.result) {
      const [home, away] = match.result.split(":").map(Number);
      await window.TippRadarCloud.scoreMatch(match.id, match.matchday, home, away);
    }
    showToast("Torsch\u00fctze gespeichert", `${player}: ${goals} Tor${goals === 1 ? "" : "e"}`);
  } catch (error) {
    showToast("Nicht gespeichert", error.message);
  }
});
document.querySelector("#save-scoring-start").addEventListener("click", async () => {
  const input = document.querySelector("#scoring-start");
  if (!input.value) return showToast("Zeitpunkt fehlt", "Bitte Datum und Uhrzeit ausw\u00e4hlen.");
  try {
    const nextStart = new Date(input.value).toISOString();
    await window.TippRadarCloud.setScoringStart(nextStart);
    scoringStart = nextStart;
    await loadOpenLigaMatches();
    await syncFromCloud();
    showToast("Wertungsstart gespeichert", formatScoringStart(scoringStart));
  } catch (error) {
    showToast("Wertungsstart nicht gespeichert", error.message);
  }
});
document.querySelector("#ledger-expand-all").addEventListener("click", () => {
  document.querySelectorAll("#points-ledger-list details").forEach((row) => {
    row.open = true;
  });
});
document.querySelector("#ledger-refresh").addEventListener("click", async () => {
  const button = document.querySelector("#ledger-refresh");
  button.disabled = true;
  button.textContent = "Wird aktualisiert";
  try {
    await loadOpenLigaMatches();
    await syncFromCloud();
    showToast("Punkte aktualisiert", "Spielplan und Wertung wurden neu geladen.");
  } catch (error) {
    showToast("Aktualisierung nicht vollständig", error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Punkte aktualisieren";
  }
});
document.querySelector("#ledger-collapse-all").addEventListener("click", () => {
  document.querySelectorAll("#points-ledger-list details").forEach((row) => {
    row.open = false;
  });
});
document.querySelector("#sign-out").addEventListener("click", async () => {
  await window.TippRadarCloud.signOut();
  updateAccountUi();
  document.querySelector("#account-modal").hidden = true;
});
window.addEventListener("tippradar-auth-change", async () => {
  updateAccountUi();
  await syncFromCloud();
});

function updateCountdown() {
  updateHomeHero(tournamentSchedule);
  updateDateTabs(tournamentSchedule);
}

renderMatches();
ensureTeamBonusRules();
renderRankChart();
renderTipMatrix();
renderTeams();
renderRules();
renderRanking();
renderPointDetails();
fantasyPicks = JSON.parse(localStorage.getItem(fantasyStorageKey()) || "[]");
renderFantasyPicks();
renderScorerMatches();
updateCountdown();
loadOpenLigaMatches();
initializeCloud();
