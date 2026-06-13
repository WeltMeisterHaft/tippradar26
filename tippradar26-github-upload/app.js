let matches = [];

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
const worldCupFinalRecord = {
  "deutschland": { titles: 4, finals: 8 },
  "brasilien": { titles: 5, finals: 7 },
  "argentinien": { titles: 3, finals: 6 },
  "argentina": { titles: 3, finals: 6 },
  "frankreich": { titles: 2, finals: 4 },
  "niederlande": { titles: 0, finals: 3 },
  "spanien": { titles: 1, finals: 1 },
  "england": { titles: 1, finals: 1 },
  "uruguay": { titles: 2, finals: 2 },
  "kroatien": { titles: 0, finals: 1 }
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
const scheduleStorageKey = "tippradar26-schedule-v1";
const squadStorageKey = "tippradar26-squad-cache-v1";
const internationalStatsStorageKey = "tippradar26-international-stats-v2";
let savedTips = JSON.parse(localStorage.getItem(storageKey) || "{}");
let selectedSeries = null;
let selectedParticipant = "all";
let teamScoreSummary = {};
let leaguePredictions = {};
let fantasyPicks = [];
let profileStandings = [];
let scoringStart = null;
let pointDetails = null;
let scorerTotals = {};
let participantInvites = {};
let participantInviteStatus = {};
let internationalStats = (() => {
  try {
    return JSON.parse(localStorage.getItem(internationalStatsStorageKey) || "[]");
  } catch {
    return [];
  }
})();
let internationalStatsIndex = {};
let internationalStatsPromise = null;
const matchViewStorageKey = "tippradar26-match-view-v1";
let activeMatchView = localStorage.getItem(matchViewStorageKey) || "next-12";
const simulationModelStorageKey = "tippradar26-simulation-model-v1";
let simulationModel = localStorage.getItem(simulationModelStorageKey) || "own";
const knockoutPhases = [
  { key: "r32", label: "Sechzehntelfinale", short: "16 SPIELE", start: 73, count: 16, kickoff: "2026-06-28T19:00:00Z" },
  { key: "r16", label: "Achtelfinale", short: "8 SPIELE", start: 89, count: 8, kickoff: "2026-07-04T15:00:00Z" },
  { key: "qf", label: "Viertelfinale", short: "4 SPIELE", start: 97, count: 4, kickoff: "2026-07-09T19:00:00Z" },
  { key: "sf", label: "Halbfinale", short: "2 SPIELE", start: 101, count: 2, kickoff: "2026-07-14T19:00:00Z" },
  { key: "final", label: "Finale", short: "1 SPIEL", start: 104, count: 1, kickoff: "2026-07-19T19:00:00Z" }
];
let tournamentSchedule = (() => {
  try {
    return JSON.parse(localStorage.getItem(scheduleStorageKey) || "[]");
  } catch {
    return [];
  }
})();
let tournamentTeams = [...new Set(tournamentSchedule.flatMap((match) => [match.home, match.away]))]
  .filter(Boolean).sort((a, b) => a.localeCompare(b, "de"));
const squadCache = (() => {
  try {
    return JSON.parse(localStorage.getItem(squadStorageKey) || "{}");
  } catch {
    return {};
  }
})();
const squadRequests = {};
const matchesList = document.querySelector("#matches-list");
const toast = document.querySelector("#toast");

function formatMatchTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin"
  }).format(date).replace(",", " /");
}

function normalizeOpenLigaMatch(apiMatch) {
  const finalResult = (apiMatch.matchResults || []).find((result) => result.resultTypeID === 2);
  return {
    id: String(apiMatch.matchID),
    kickoff: apiMatch.matchDateTimeUTC || apiMatch.matchDateTime,
    time: formatMatchTime(apiMatch.matchDateTime),
    group: apiMatch.group?.groupName || "WM 2026",
    home: apiMatch.team1?.teamName || "Heimteam noch offen",
    away: apiMatch.team2?.teamName || "Ausw\u00e4rtsteam noch offen",
    homeFlag: apiMatch.team1?.teamIconUrl ? `<img src="${apiMatch.team1.teamIconUrl}" alt="">` : "&#x26BD;",
    awayFlag: apiMatch.team2?.teamIconUrl ? `<img src="${apiMatch.team2.teamIconUrl}" alt="">` : "&#x26BD;",
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
  if (!container) return;
  schedule = Array.isArray(schedule) ? schedule : [];
  const allMatches = allTippableMatches();
  const openCount = allMatches.filter(isMatchOpen).length;
  const groupRounds = [1, 2, 3].map((round) => ({
    round,
    count: schedule.filter((match) => groupStageRound(match, schedule) === round).length
  }));
  container.innerHTML = `
    <div class="tip-stage">
      <strong>Vorrunde</strong>
      <div>
        ${groupRounds.map(({ round, count }) => `
          <button class="date-tab ${activeMatchView === `group:${round}` ? "active" : ""}" data-match-view="group:${round}">
            <small>GRUPPE</small><strong>SPIELTAG ${round}</strong><span>${count} Spiele</span>
          </button>`).join("")}
      </div>
    </div>
    <div class="tip-stage">
      <strong>K.-o.-Runde</strong>
      <div>
        ${knockoutPhases.map((phase) => `
          <button class="date-tab ${activeMatchView === `ko:${phase.key}` ? "active" : ""}" data-match-view="ko:${phase.key}">
            <small>K.O.</small><strong>${phase.label.toUpperCase()}</strong><span>${phase.short}</span>
          </button>`).join("")}
      </div>
    </div>
    <div class="tip-stage compact">
      <strong>Schnellwahl</strong>
      <div>
        <button class="date-tab ${activeMatchView === "next-12" ? "active" : ""}" data-match-view="next-12">
          <small>JETZT</small><strong>N&Auml;CHSTE 12</strong><span>kompakte Ansicht</span>
        </button>
        <button class="date-tab ${activeMatchView === "all-open" ? "active" : ""}" data-match-view="all-open">
          <small>ALLE</small><strong>ALLE OFFENEN</strong><span>${openCount} Spiele</span>
        </button>
      </div>
    </div>`;
}

function applyMatchView(schedule = tournamentSchedule) {
  const allMatches = allTippableMatches();
  const openMatches = allMatches.filter(isMatchOpen);
  if (activeMatchView === "all-open") {
    matches = openMatches;
  } else if (activeMatchView.startsWith("group:")) {
    const round = Number(activeMatchView.slice(6));
    matches = schedule.filter((match) => groupStageRound(match, schedule) === round);
  } else if (activeMatchView.startsWith("ko:")) {
    const phase = activeMatchView.slice(3);
    matches = projectedKnockoutMatches().filter((match) => match.phase === phase);
    if (!matches.length) {
      activeMatchView = "next-12";
      matches = openMatches.slice(0, 12);
    }
  } else {
    matches = openMatches.slice(0, 12);
  }
  if (!matches.length) matches = allMatches.slice(-12);
}

async function loadOpenLigaMatches() {
  const status = document.querySelector("#match-data-status");
  try {
    const response = await fetch("https://api.openligadb.de/getmatchdata/wm26/2026");
    if (!response.ok) throw new Error(`OpenLigaDB ${response.status}`);
    const data = await response.json();
    const normalized = assignKnockoutProjectionIds(assignGroupLetters(data
      .filter((match) => match.team1 && match.team2)
      .sort((a, b) => new Date(a.matchDateTime) - new Date(b.matchDateTime))
      .map(normalizeOpenLigaMatch)));
    if (!normalized.length) throw new Error("Keine WM-Spiele gefunden");
    tournamentSchedule = normalized;
    localStorage.setItem(scheduleStorageKey, JSON.stringify(normalized));
    updateRoundSummary();
    updateHomeHero(normalized);
    updateDateTabs(normalized);
    tournamentTeams = [...new Set(normalized.flatMap((match) => [match.home, match.away]))]
      .sort((a, b) => a.localeCompare(b, "de"));
    if (window.TippRadarCloud?.league?.role === "organizer") {
      await window.TippRadarCloud.syncSchedule([
        ...normalized,
        ...projectionScheduleSlots().filter((slot) =>
          !normalized.some((match) => String(match.id) === String(slot.id))
        )
      ]);
    }
    applyMatchView(normalized);
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
    if (tournamentSchedule.length) {
      applyMatchView(tournamentSchedule);
      updateHomeHero(tournamentSchedule);
      updateDateTabs(tournamentSchedule);
      status.textContent = "Letzter gespeicherter OpenLigaDB-Spielplan";
      renderMatches();
      renderTipMatrix();
      renderFantasyPicks();
      renderPointDetails();
    } else {
      matches = [];
      status.textContent = "OpenLigaDB momentan nicht erreichbar";
      renderMatches();
    }
    status.parentElement.classList.add("fallback");
  }
}

function renderMatches() {
  const activeAutoStrategy = window.TippRadarCloud?.activeProfile?.auto_strategy || "manual";
  const automatic = activeAutoStrategy !== "manual";
  const cloud = window.TippRadarCloud;
  const activeProfile = cloud?.activeProfile;
  const delegatedAdultOrYouth = Boolean(
    cloud?.session
    && activeProfile
    && activeProfile.account_user_id !== cloud.session.user.id
    && ["adult", "youth"].includes(activeProfile.profile_type)
  );
  matchesList.innerHTML = matches.length ? matches.map((match) => {
    const tip = savedTips[match.id] || {};
    const delegatedTipLocked = delegatedAdultOrYouth
      && tip.home !== undefined && tip.away !== undefined;
    const counted = isMatchCounted(match);
    const open = isMatchOpen(match) && counted;
    const editable = open && !automatic && !delegatedTipLocked;
    return `
      <article class="match-card ${open ? "" : "match-locked"} ${delegatedTipLocked ? "delegated-tip-locked" : ""}" data-match="${match.id}" data-kickoff="${match.kickoff}">
        <div class="match-meta"><strong>${match.time}</strong><span>${match.group}</span>${match.projection ? '<small class="projection-hint">Vorschlag aus deinen Tipps</small>' : ""}</div>
        <div class="match-teams">
          <div class="match-team"><span class="small-flag">${match.homeFlag}</span>${match.home}</div>
          <div class="match-team"><span class="small-flag">${match.awayFlag}</span>${match.away}</div>
        </div>
        <div class="score-inputs" aria-label="Ergebnis fuer ${match.home} gegen ${match.away}">
          <input class="score-input" data-side="home" type="number" min="0" max="20" inputmode="numeric" value="${tip.home ?? ""}" aria-label="Tore ${match.home}" ${editable ? "" : "disabled"}>
          <span>:</span>
          <input class="score-input" data-side="away" type="number" min="0" max="20" inputmode="numeric" value="${tip.away ?? ""}" aria-label="Tore ${match.away}" ${editable ? "" : "disabled"}>
        </div>
        <div class="match-insights">
          <div class="cooper-pick">
            <span class="cooper-badge">A</span>
            <span><small>Prognosemodelle</small><strong>DOG / RANK / STAT / DNA</strong></span>
            <span class="confidence">${open ? "Tipps bis Anpfiff geheim" : "Tipps sichtbar"}</span>
          </div>
        </div>
        <div class="model-strip">
          <span><small>DOG</small><b>Zufall</b></span>
          <span><small>RANK</small><b>FIFA-Rang</b></span>
          <span><small>STAT</small><b>Tormodell</b></span>
          <span><small>DNA</small><b>WM-Erfahrung</b></span>
        </div>
        ${!counted
          ? '<div class="locked-label excluded-label">Au&szlig;er Wertung</div>'
          : delegatedTipLocked && open
          ? '<div class="locked-label delegated-label">Bereits gespeichert &middot; nur das eigene Profil darf &auml;ndern</div>'
          : automatic && open
          ? `<div class="locked-label auto-label">AUTO · ${activeAutoStrategy.toUpperCase()}</div>`
          : (open ? "" : '<div class="locked-label">Tipp geschlossen</div>')}
      </article>`;
  }).join("") : `<div class="matches-empty"><strong>Spielplan momentan nicht verfügbar</strong><span>Sobald OpenLigaDB wieder erreichbar ist, erscheinen hier die WM-Spiele. Ein bereits geladener Spielplan wird automatisch gespeichert.</span></div>`;
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
  const tips = { ...savedTips };
  document.querySelectorAll(".match-card").forEach((card) => {
    if (card.classList.contains("match-locked")) return;
    const home = card.querySelector('[data-side="home"]').value;
    const away = card.querySelector('[data-side="away"]').value;
    if (home !== "" && away !== "") tips[card.dataset.match] = { home: Number(home), away: Number(away) };
  });
  return tips;
}

function updateProgress() {
  const tips = collectTips();
  const availableMatches = allTippableMatches().filter((match) => isMatchOpen(match) && isMatchCounted(match));
  const count = availableMatches.filter((match) => tips[String(match.id)]?.home !== undefined
    && tips[String(match.id)]?.away !== undefined).length;
  document.querySelector("#tip-progress").textContent = `${count} von ${availableMatches.length} offenen Spielen getippt`;
  const status = document.querySelector(".tip-status");
  status.querySelector("h3").textContent = count
    ? `${count} Tipp${count === 1 ? "" : "s"} bereit`
    : "Noch kein offener Tipp";
  status.querySelector("p").textContent = !availableMatches.length
    ? "Der Spielplan wird geladen oder alle Spiele sind bereits geschlossen."
    : count === availableMatches.length
    ? "Perfekt, alle offenen Spiele sind vorbereitet."
    : count
    ? "Ein guter Anfang. Weitere Spieltage kannst du oben ausw\u00e4hlen."
    : "W\u00e4hle unter Tippen die n\u00e4chsten Spiele oder alle offenen Begegnungen.";
  renderTipMatrix();
  renderTournamentSimulation();
}

function groupLetterForMatch(match) {
  if (match.groupLetter) return match.groupLetter;
  const label = `${match.group || ""} ${match.matchday || ""}`;
  const matchResult = label.match(/(?:gruppe|group)\s*([A-L])\b/i)
    || label.match(/^\s*([A-L])(?:\s|$)/i);
  return matchResult?.[1]?.toUpperCase() || null;
}

const worldCupGroupTeams = {
  A: ["mexico", "mexiko", "south africa", "sudafrika", "south korea", "sudkorea", "czech republic", "czechia", "tschechien"],
  B: ["canada", "kanada", "bosnia and herzegovina", "bosnien-herzegowina", "qatar", "katar", "switzerland", "schweiz"],
  C: ["brazil", "brasilien", "morocco", "marokko", "haiti", "scotland", "schottland"],
  D: ["united states", "usa", "paraguay", "australia", "australien", "turkey", "turkei"],
  E: ["germany", "deutschland", "curacao", "ivory coast", "cote d'ivoire", "elfenbeinkuste", "ecuador"],
  F: ["netherlands", "niederlande", "japan", "sweden", "schweden", "tunisia", "tunesien"],
  G: ["belgium", "belgien", "egypt", "agypten", "iran", "new zealand", "neuseeland"],
  H: ["spain", "spanien", "cape verde", "kap verde", "saudi arabia", "saudi-arabien", "uruguay"],
  I: ["france", "frankreich", "senegal", "iraq", "irak", "norway", "norwegen"],
  J: ["argentina", "argentinien", "algeria", "algerien", "austria", "osterreich", "jordan", "jordanien"],
  K: ["portugal", "dr congo", "dr kongo", "uzbekistan", "usbekistan", "colombia", "kolumbien"],
  L: ["england", "croatia", "kroatien", "ghana", "panama"]
};
const worldCupGroupByTeam = Object.fromEntries(Object.entries(worldCupGroupTeams)
  .flatMap(([group, names]) => names.map((name) => [normalizedTeamName(name), group])));
const worldCupGroupDisplay = {
  A: ["Mexiko", "S\u00fcdafrika", "S\u00fdkorea", "Tschechien"],
  B: ["Kanada", "Bosnien-Herzegowina", "Katar", "Schweiz"],
  C: ["Brasilien", "Marokko", "Haiti", "Schottland"],
  D: ["USA", "Paraguay", "Australien", "T\u00fcrkei"],
  E: ["Deutschland", "Cura\u00e7ao", "Elfenbeink\u00fcste", "Ecuador"],
  F: ["Niederlande", "Japan", "Schweden", "Tunesien"],
  G: ["Belgien", "\u00c4gypten", "Iran", "Neuseeland"],
  H: ["Spanien", "Kap Verde", "Saudi-Arabien", "Uruguay"],
  I: ["Frankreich", "Senegal", "Irak", "Norwegen"],
  J: ["Argentinien", "Algerien", "\u00d6sterreich", "Jordanien"],
  K: ["Portugal", "DR Kongo", "Usbekistan", "Kolumbien"],
  L: ["England", "Kroatien", "Ghana", "Panama"]
};
tournamentSchedule = assignGroupLetters(tournamentSchedule);

function sameNationalTeam(first, second) {
  return canonicalNationalTeam(first) === canonicalNationalTeam(second);
}

function officialSimulationMatches() {
  return Object.entries(worldCupGroupDisplay).flatMap(([group, teams]) =>
    teams.flatMap((home, homeIndex) =>
      teams.slice(homeIndex + 1).map((away) => {
        const liveMatch = tournamentSchedule.find((match) =>
          (sameNationalTeam(match.home, home) && sameNationalTeam(match.away, away))
          || (sameNationalTeam(match.home, away) && sameNationalTeam(match.away, home))
        );
        const reversed = liveMatch && sameNationalTeam(liveMatch.home, away);
        const liveResult = liveMatch?.result?.split(":").map(Number);
        const result = liveResult?.length === 2
          ? `${reversed ? liveResult[1] : liveResult[0]}:${reversed ? liveResult[0] : liveResult[1]}`
          : null;
        return {
          id: liveMatch?.id || `simulation-${group}-${homeIndex}-${teams.indexOf(away)}`,
          group: `Gruppe ${group}`,
          groupLetter: group,
          home,
          away,
          result,
          sourceMatch: liveMatch || null
        };
      })
    )
  );
}

function assignGroupLetters(schedule) {
  const groupStage = schedule.filter((match) => {
    const kickoff = new Date(match.kickoff).getTime();
    return Number.isFinite(kickoff) && kickoff < new Date("2026-06-28T00:00:00Z").getTime();
  });
  const neighbors = {};
  groupStage.forEach((match) => {
    neighbors[match.home] ||= new Set();
    neighbors[match.away] ||= new Set();
    neighbors[match.home].add(match.away);
    neighbors[match.away].add(match.home);
  });
  const components = [];
  const visited = new Set();
  Object.keys(neighbors).forEach((team) => {
    if (visited.has(team)) return;
    const component = [];
    const queue = [team];
    visited.add(team);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      neighbors[current].forEach((opponent) => {
        if (visited.has(opponent)) return;
        visited.add(opponent);
        queue.push(opponent);
      });
    }
    if (component.length >= 2) {
      const firstKickoff = Math.min(...groupStage
        .filter((match) => component.includes(match.home) || component.includes(match.away))
        .map((match) => new Date(match.kickoff).getTime()));
      components.push({ teams: component, firstKickoff });
    }
  });
  components.sort((a, b) => a.firstKickoff - b.firstKickoff);
  const teamGroup = {};
  components.slice(0, 12).forEach((component, index) => {
    const letter = String.fromCharCode(65 + index);
    component.teams.forEach((team) => { teamGroup[team] = letter; });
  });
  return schedule.map((match) => ({
    ...match,
    groupLetter: groupLetterForMatch(match)
      || worldCupGroupByTeam[normalizedTeamName(match.home)]
      || worldCupGroupByTeam[normalizedTeamName(match.away)]
      || teamGroup[match.home]
      || teamGroup[match.away]
      || null
  }));
}

function simulationTipForMatch(match, ownTips) {
  if (simulationModel === "own") {
    const directTip = ownTips[String(match.id)];
    if (!directTip || !match.sourceMatch) return directTip || null;
    const reversed = sameNationalTeam(match.sourceMatch.home, match.away);
    return reversed ? { home: directTip.away, away: directTip.home } : directTip;
  }
  const [home, away] = botTip({
    id: `simulation-${simulationModel}`,
    strategy: simulationModel
  }, match).split(":").map(Number);
  return { home, away };
}

function simulatedGroupStandings() {
  const ownTips = simulationModel === "own" ? collectTips() : {};
  const groupMatches = officialSimulationMatches();
  const groups = Object.fromEntries(Object.entries(worldCupGroupDisplay).map(([group, teams]) => [
    group,
    Object.fromEntries(teams.map((team) => [
      team,
      { team, group, played: 0, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 }
    ]))
  ]));
  let predicted = 0;
  groupMatches.forEach((match) => {
    const group = match.groupLetter;
    const simulatedTip = simulationTipForMatch(match, ownTips);
    const score = match.result
      ? match.result.split(":").map(Number)
      : simulatedTip?.home !== undefined && simulatedTip?.away !== undefined
      ? [Number(simulatedTip.home), Number(simulatedTip.away)]
      : null;
    if (!score || score.some((value) => !Number.isFinite(value))) return;
    predicted += 1;
    const home = groups[group][match.home];
    const away = groups[group][match.away];
    home.played += 1;
    away.played += 1;
    home.goalsFor += score[0];
    home.goalsAgainst += score[1];
    away.goalsFor += score[1];
    away.goalsAgainst += score[0];
    if (score[0] > score[1]) home.points += 3;
    else if (score[0] < score[1]) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  });
  const sortedGroups = Object.fromEntries(Object.entries(groups).map(([group, teams]) => [
    group,
    Object.values(teams).map((team) => ({
      ...team,
      goalDifference: team.goalsFor - team.goalsAgainst
    })).sort((a, b) =>
      b.points - a.points
      || b.goalDifference - a.goalDifference
      || b.goalsFor - a.goalsFor
      || a.team.localeCompare(b.team, "de")
    )
  ]));
  return { groups: sortedGroups, predicted, total: groupMatches.length };
}

function projectedThirdAssignments(thirds) {
  const slots = [
    { id: 74, allowed: "ABCDF" },
    { id: 77, allowed: "CDFGH" },
    { id: 79, allowed: "CEFHI" },
    { id: 80, allowed: "EHIJK" },
    { id: 81, allowed: "BEFIJ" },
    { id: 82, allowed: "AEHIJ" },
    { id: 85, allowed: "EFGIJ" },
    { id: 87, allowed: "DEIJL" }
  ];
  const assignment = {};
  function place(index, usedGroups) {
    if (index === slots.length) return true;
    const slot = slots[index];
    for (const third of thirds) {
      if (usedGroups.has(third.group) || !slot.allowed.includes(third.group)) continue;
      assignment[slot.id] = third;
      usedGroups.add(third.group);
      if (place(index + 1, usedGroups)) return true;
      usedGroups.delete(third.group);
      delete assignment[slot.id];
    }
    return false;
  }
  place(0, new Set());
  return assignment;
}

function isGroupStageMatch(match) {
  const kickoff = new Date(match.kickoff).getTime();
  return Number.isFinite(kickoff) && kickoff < new Date(knockoutPhases[0].kickoff).getTime();
}

function groupStageRound(match, schedule = tournamentSchedule) {
  if (!isGroupStageMatch(match)) return null;
  const group = groupLetterForMatch(match);
  const groupMatches = schedule.filter((item) =>
    isGroupStageMatch(item) && groupLetterForMatch(item) === group
  ).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const index = groupMatches.findIndex((item) => String(item.id) === String(match.id));
  return index < 0 ? null : Math.min(3, Math.floor(index / 2) + 1);
}

function initialKnockoutPairings(simulation) {
  const groupEntries = Object.entries(simulation.groups);
  const thirds = groupEntries.map(([group, rows]) => rows[2]).filter(Boolean)
    .sort((a, b) =>
      b.points - a.points
      || b.goalDifference - a.goalDifference
      || b.goalsFor - a.goalsFor
      || a.team.localeCompare(b.team, "de")
    ).slice(0, 8);
  const first = (group) => simulation.groups[group]?.[0];
  const second = (group) => simulation.groups[group]?.[1];
  const thirdAssignments = projectedThirdAssignments(thirds);
  const projectedThird = (matchNumber, allowed) => thirdAssignments[matchNumber]
    || { team: `3. aus ${allowed.split("").join("/")}`, group: "?" };
  return [
    [second("A"), second("B")],
    [first("E"), projectedThird(74, "ABCDF")],
    [first("F"), second("C")],
    [first("C"), second("F")],
    [first("I"), projectedThird(77, "CDFGH")],
    [second("E"), second("I")],
    [first("A"), projectedThird(79, "CEFHI")],
    [first("L"), projectedThird(80, "EHIJK")],
    [first("D"), projectedThird(81, "BEFIJ")],
    [first("G"), projectedThird(82, "AEHIJ")],
    [second("K"), second("L")],
    [first("H"), second("J")],
    [first("B"), projectedThird(85, "EFGIJ")],
    [first("J"), second("H")],
    [first("K"), projectedThird(87, "DEIJL")],
    [second("D"), second("G")]
  ];
}

function projectedWinner(match, tips) {
  const tip = tips[String(match.id)];
  if (tip && Number(tip.home) !== Number(tip.away)) {
    return Number(tip.home) > Number(tip.away) ? match.homeEntry : match.awayEntry;
  }
  const [home, away] = statTip(match).split(":").map(Number);
  if (home !== away) return home > away ? match.homeEntry : match.awayEntry;
  return rankFor(match.home) <= rankFor(match.away) ? match.homeEntry : match.awayEntry;
}

function knockoutPhaseForDate(kickoff) {
  const time = new Date(kickoff).getTime();
  for (let index = knockoutPhases.length - 1; index >= 0; index -= 1) {
    if (time >= new Date(knockoutPhases[index].kickoff).getTime()) return knockoutPhases[index];
  }
  return null;
}

function assignKnockoutProjectionIds(schedule) {
  const grouped = Object.fromEntries(knockoutPhases.map((phase) => [phase.key, []]));
  schedule.forEach((match) => {
    if (isGroupStageMatch(match)) return;
    const phase = knockoutPhaseForDate(match.kickoff);
    if (phase) grouped[phase.key].push(match);
  });
  Object.values(grouped).forEach((matchesInPhase) =>
    matchesInPhase.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
  );
  return schedule.map((match) => {
    if (isGroupStageMatch(match)) return match;
    const phase = knockoutPhaseForDate(match.kickoff);
    const index = phase ? grouped[phase.key].indexOf(match) : -1;
    return phase && index >= 0 && index < phase.count
      ? { ...match, id: `projection-${phase.start + index}`, officialMatchId: String(match.id) }
      : match;
  });
}

function projectedKnockoutMatches(tips = collectTips()) {
  const simulation = simulatedGroupStandings();
  let entrants = initialKnockoutPairings(simulation);
  const projected = [];
  const officialByPhase = Object.fromEntries(knockoutPhases.map((phase) => [
    phase.key,
    tournamentSchedule.filter((match) =>
      !isGroupStageMatch(match) && knockoutPhaseForDate(match.kickoff)?.key === phase.key
    ).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
  ]));

  knockoutPhases.forEach((phase) => {
    const phaseMatches = [];
    for (let index = 0; index < phase.count; index += 1) {
      const official = officialByPhase[phase.key][index];
      const pairing = entrants[index] || [];
      const homeEntry = official ? { team: official.home } : pairing[0];
      const awayEntry = official ? { team: official.away } : pairing[1];
      const id = `projection-${phase.start + index}`;
      const match = {
        id,
        slot: phase.start + index,
        phase: phase.key,
        kickoff: official?.kickoff || phase.kickoff,
        time: official?.time || `bis ${new Intl.DateTimeFormat("de-DE", {
          day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin"
        }).format(new Date(phase.kickoff))}`,
        group: official ? phase.label : `${phase.label} · Vorschlag aus deinen Tipps`,
        matchday: phase.label,
        home: homeEntry?.team || "Noch offen",
        away: awayEntry?.team || "Noch offen",
        homeEntry: homeEntry || { team: "Noch offen" },
        awayEntry: awayEntry || { team: "Noch offen" },
        homeFlag: official?.homeFlag || "&#x26BD;",
        awayFlag: official?.awayFlag || "&#x26BD;",
        result: official?.result || null,
        projection: !official,
        openLigaId: official?.openLigaId || null
      };
      phaseMatches.push(match);
      projected.push(match);
    }
    entrants = phaseMatches.length > 1
      ? Array.from({ length: Math.ceil(phaseMatches.length / 2) }, (_, index) => [
          projectedWinner(phaseMatches[index * 2], tips),
          projectedWinner(phaseMatches[(index * 2) + 1], tips)
        ])
      : [];
  });
  return projected;
}

function projectionScheduleSlots() {
  return knockoutPhases.flatMap((phase) =>
    Array.from({ length: phase.count }, (_, index) => ({
      id: `projection-${phase.start + index}`,
      kickoff: phase.kickoff,
      matchday: phase.label,
      home: `Teilnehmer Spiel ${phase.start + index}`,
      away: `Teilnehmer Spiel ${phase.start + index}`
    }))
  );
}

function allTippableMatches() {
  return [
    ...tournamentSchedule.filter(isGroupStageMatch),
    ...projectedKnockoutMatches()
  ].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff) || String(a.id).localeCompare(String(b.id)));
}

function simulateKnockoutMatch(home, away, matchId) {
  const strategy = simulationModel === "own" ? "stat" : simulationModel;
  const ownTip = simulationModel === "own" ? collectTips()[`projection-${matchId}`] : null;
  const [homeGoals, awayGoals] = ownTip
    ? [Number(ownTip.home), Number(ownTip.away)]
    : botTip({ id: `knockout-${strategy}`, strategy }, {
        id: `knockout-${matchId}-${home.team}-${away.team}`,
        home: home.team,
        away: away.team
      }).split(":").map(Number);
  let winner = homeGoals > awayGoals ? home : away;
  let decidedBy = "";
  if (homeGoals === awayGoals) {
    if (strategy === "dog") {
      winner = seededNumber(`${matchId}-${home.team}-${away.team}`) >= 0.5 ? home : away;
      decidedBy = ownTip ? "Vorschlag n. E." : "n. E.";
    } else if (strategy === "dna") {
      const homeDna = tournamentDnaScore(home.team);
      const awayDna = tournamentDnaScore(away.team);
      winner = homeDna === awayDna
        ? (rankFor(home.team) <= rankFor(away.team) ? home : away)
        : (homeDna > awayDna ? home : away);
      decidedBy = "Turnier-DNA";
    } else {
      winner = rankFor(home.team) <= rankFor(away.team) ? home : away;
      decidedBy = "n. E.";
    }
  }
  return { matchId, home, away, homeGoals, awayGoals, winner, decidedBy };
}

function simulateKnockoutRound(teams, startNumber) {
  const matches = [];
  for (let index = 0; index < teams.length; index += 2) {
    matches.push(simulateKnockoutMatch(teams[index], teams[index + 1], startNumber + (index / 2)));
  }
  return matches;
}

function renderKnockoutRound(title, matches) {
  return `
    <section class="tournament-round">
      <div class="tournament-round-title"><h3>${title}</h3><span>${matches.length} Spiel${matches.length === 1 ? "" : "e"}</span></div>
      <div class="round-grid">${matches.map((match) => `
        <article class="knockout-match">
          <small>SPIEL ${match.matchId}</small>
          <div class="knockout-team ${match.winner === match.home ? "winner" : ""}">
            <span>${escapeHtml(match.home.team)}</span><em>${match.homeGoals}</em>
          </div>
          <div class="knockout-team ${match.winner === match.away ? "winner" : ""}">
            <span>${escapeHtml(match.away.team)}</span><em>${match.awayGoals}${match.decidedBy && match.winner === match.away ? ` · ${match.decidedBy}` : ""}</em>
          </div>
          ${match.decidedBy && match.winner === match.home ? `<small>${escapeHtml(match.winner.team)} ${match.decidedBy}</small>` : ""}
        </article>`).join("")}
      </div>
    </section>`;
}

function renderTournamentSimulation() {
  const groupContainer = document.querySelector("#simulation-groups");
  const bracketContainer = document.querySelector("#simulation-bracket");
  const status = document.querySelector("#simulation-status");
  if (!groupContainer || !bracketContainer || !status) return;
  const simulation = simulatedGroupStandings();
  const modelSelect = document.querySelector("#simulation-model");
  if (modelSelect) modelSelect.value = simulationModel;
  const modelNames = {
    own: "deinen eigenen Tipps",
    dog: "DOG / Zufall",
    rank: "RANK / FIFA-Rangliste",
    stat: "STAT / Tormodell",
    dna: "DNA / WM-Erfahrung"
  };
  const groupEntries = Object.entries(simulation.groups).sort(([a], [b]) => a.localeCompare(b));
  if (!groupEntries.length) {
    status.textContent = "Die Simulation konnte nicht aufgebaut werden. Bitte die Seite neu laden.";
    groupContainer.innerHTML = "";
    bracketContainer.innerHTML = "";
    return;
  }
  const thirds = groupEntries.map(([group, rows]) => rows[2]).filter(Boolean)
    .sort((a, b) =>
      b.points - a.points
      || b.goalDifference - a.goalDifference
      || b.goalsFor - a.goalsFor
      || a.team.localeCompare(b.team, "de")
    );
  const qualifiedThirds = thirds.slice(0, 8);
  const qualifiedThirdGroups = new Set(qualifiedThirds.map((team) => team.group));
  groupContainer.innerHTML = groupEntries.map(([group, rows]) => `
    <article class="simulation-group">
      <h3>Gruppe ${group}</h3>
      ${rows.map((row, index) => `
        <div class="simulation-row ${index < 2 ? "qualifier" : ""} ${index === 2 && qualifiedThirdGroups.has(group) ? "third-qualified" : ""}">
          <span class="rank">${index + 1}.</span><strong>${escapeHtml(row.team)}</strong>
          <span>${row.points}</span><span>${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</span><span>${row.goalsFor}</span>
        </div>`).join("")}
    </article>`).join("");

  const first = (group) => simulation.groups[group]?.[0];
  const second = (group) => simulation.groups[group]?.[1];
  const thirdAssignments = projectedThirdAssignments(qualifiedThirds);
  const projectedThird = (matchNumber, allowed) => thirdAssignments[matchNumber]
    || { team: `3. aus ${allowed.split("").join("/")}`, group: "?" };
  const pairings = [
    [73, second("A"), second("B")],
    [74, first("E"), projectedThird(74, "ABCDF")],
    [75, first("F"), second("C")],
    [76, first("C"), second("F")],
    [77, first("I"), projectedThird(77, "CDFGH")],
    [78, second("E"), second("I")],
    [79, first("A"), projectedThird(79, "CEFHI")],
    [80, first("L"), projectedThird(80, "EHIJK")],
    [81, first("D"), projectedThird(81, "BEFIJ")],
    [82, first("G"), projectedThird(82, "AEHIJ")],
    [83, second("K"), second("L")],
    [84, first("H"), second("J")],
    [85, first("B"), projectedThird(85, "EFGIJ")],
    [86, first("J"), second("H")],
    [87, first("K"), projectedThird(87, "DEIJL")],
    [88, second("D"), second("G")]
  ];
  const roundOf32 = pairings.map(([number, home, away]) =>
    simulateKnockoutMatch(home, away, number)
  );
  const roundOf16 = simulateKnockoutRound(roundOf32.map((match) => match.winner), 89);
  const quarterFinals = simulateKnockoutRound(roundOf16.map((match) => match.winner), 97);
  const semiFinals = simulateKnockoutRound(quarterFinals.map((match) => match.winner), 101);
  const final = simulateKnockoutRound(semiFinals.map((match) => match.winner), 104);
  const champion = final[0].winner;
  bracketContainer.innerHTML = `
    ${renderKnockoutRound("Projiziertes Sechzehntelfinale", roundOf32)}
    ${renderKnockoutRound("Achtelfinale", roundOf16)}
    ${renderKnockoutRound("Viertelfinale", quarterFinals)}
    ${renderKnockoutRound("Halbfinale", semiFinals)}
    ${renderKnockoutRound("Finale", final)}
    <div class="champion-card">
      <small>PROGNOSTIZIERTER WELTMEISTER</small>
      <strong>${escapeHtml(champion.team)}</strong>
      <span>${modelNames[simulationModel]}</span>
    </div>`;
  const missing = Math.max(0, simulation.total - simulation.predicted);
  status.textContent = simulationModel === "own" && missing
    ? `Grundlage: ${modelNames[simulationModel]}. ${simulation.predicted} von ${simulation.total} Gruppenspielen berücksichtigt. Noch ${missing} Gruppentipps fehlen.`
    : `Grundlage: ${modelNames[simulationModel]}. Alle ${simulation.total} Gruppenspiele sind in der Was-wäre-wenn-Projektion berücksichtigt.`;
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

function normalizedPlayerName(name) {
  return normalizedTeamName(name)
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalNationalTeam(name) {
  const normalized = normalizedTeamName(name);
  return ({
    "argentinien": "argentina",
    "australien": "australia",
    "belgien": "belgium",
    "brasilien": "brazil",
    "danemark": "denmark",
    "frankreich": "france",
    "jordanien": "jordan",
    "kanada": "canada",
    "katar": "qatar",
    "kolumbien": "colombia",
    "kroatien": "croatia",
    "marokko": "morocco",
    "mexiko": "mexico",
    "sudafrika": "south africa",
    "sudkorea": "south korea",
    "tschechien": "czech republic",
    "deutschland": "germany",
    "niederlande": "netherlands",
    "neuseeland": "new zealand",
    "norwegen": "norway",
    "osterreich": "austria",
    "schottland": "scotland",
    "schweden": "sweden",
    "schweiz": "switzerland",
    "spanien": "spain",
    "tunesien": "tunisia",
    "turkei": "turkey",
    "usbekistan": "uzbekistan",
    "elfenbeinkuste": "ivory coast",
    "vereinigte staaten": "united states",
    "usa": "united states",
    "dr kongo": "dr congo",
    "kap verde": "cape verde",
    "saudi-arabien": "saudi arabia",
    "bosnien-herzegowina": "bosnia and herzegovina"
  })[normalized] || normalized;
}

function playerShortKey(name) {
  const parts = normalizedPlayerName(name).split(" ").filter(Boolean);
  if (parts.length < 2) return "";
  return `${parts[0][0]}:${parts.at(-1)}`;
}

function publicPlayerId(team, name) {
  const key = `${canonicalNationalTeam(team)}|${normalizedPlayerName(name)}`;
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `wiki-${hash >>> 0}`;
}

function wikipediaPosition(value) {
  const position = String(value || "").toUpperCase();
  if (position.includes("GK")) return "Goalkeeper";
  if (position.includes("DF")) return "Defender";
  if (position.includes("MF")) return "Midfielder";
  if (position.includes("FW")) return "Attacker";
  return "Midfielder";
}

function publicSquadForTeam(teamName) {
  const team = canonicalNationalTeam(teamName);
  const players = internationalStats
    .filter((stat) => canonicalNationalTeam(stat.team) === team)
    .map((stat) => ({
      id: publicPlayerId(stat.team, stat.name),
      name: stat.name,
      position: stat.position,
      number: stat.number,
      team: stat.team,
      source: "wikipedia"
    }))
    .sort((a, b) => (a.number || 99) - (b.number || 99) || a.name.localeCompare(b.name));
  return players.length ? {
    team: teamName,
    teamId: null,
    players,
    source: "wikipedia",
    cachedAt: new Date().toISOString()
  } : null;
}

function populatePublicSquadCache() {
  const teamNames = new Set([
    ...tournamentTeams,
    ...fantasyPicks.map((pick) => pick.national_team).filter(Boolean)
  ]);
  let changed = false;
  teamNames.forEach((teamName) => {
    const cacheKey = normalizedTeamName(teamName);
    if (squadCache[cacheKey]?.players?.length) return;
    const publicSquad = publicSquadForTeam(teamName);
    if (!publicSquad) return;
    squadCache[cacheKey] = publicSquad;
    changed = true;
  });
  if (changed) localStorage.setItem(squadStorageKey, JSON.stringify(squadCache));
}

function parsePublicSquadHtml(teamName, html) {
  const documentCopy = new DOMParser().parseFromString(html || "", "text/html");
  const table = documentCopy.querySelector("table.wikitable");
  if (!table) return [];
  const headers = [...table.querySelectorAll("tr:first-child th")]
    .map((cell) => normalizedPlayerName(cell.textContent));
  const playerIndex = headers.findIndex((header) => header === "player");
  const numberIndex = headers.findIndex((header) => header === "no");
  const positionIndex = headers.findIndex((header) => header === "pos");
  const capsIndex = headers.findIndex((header) => header === "caps");
  const goalsIndex = headers.findIndex((header) => header === "goals");
  if (playerIndex < 0 || capsIndex < 0 || goalsIndex < 0) return [];
  return [...table.querySelectorAll("tr")].slice(1).map((row) => {
    const cells = [...row.querySelectorAll(":scope > th, :scope > td")];
    const name = cells[playerIndex]?.textContent
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s*\(captain\)\s*/gi, " ")
      .trim();
    const caps = Number.parseInt(cells[capsIndex]?.textContent, 10);
    const goals = Number.parseInt(cells[goalsIndex]?.textContent, 10);
    return name && Number.isFinite(caps) && Number.isFinite(goals) ? {
      name,
      team: teamName,
      number: Number.parseInt(cells[numberIndex]?.textContent, 10) || null,
      position: wikipediaPosition(cells[positionIndex]?.textContent),
      caps,
      goals
    } : null;
  }).filter(Boolean);
}

function mergeInternationalStats(records) {
  const merged = new Map(internationalStats.map((stat) => [
    `${canonicalNationalTeam(stat.team)}|${normalizedPlayerName(stat.name)}`,
    stat
  ]));
  records.forEach((stat) => {
    merged.set(`${canonicalNationalTeam(stat.team)}|${normalizedPlayerName(stat.name)}`, stat);
  });
  internationalStats = [...merged.values()];
  localStorage.setItem(internationalStatsStorageKey, JSON.stringify(internationalStats));
  rebuildInternationalStatsIndex();
}

async function loadPublicSquadFallback(teamName) {
  const result = await window.TippRadarCloud?.loadPublicSquad?.(teamName);
  const records = parsePublicSquadHtml(result?.team || teamName, result?.html);
  if (!records.length) return null;
  mergeInternationalStats(records);
  return publicSquadForTeam(teamName);
}

function rebuildInternationalStatsIndex() {
  const candidates = {};
  internationalStats.forEach((stat) => {
    const team = canonicalNationalTeam(stat.team || "");
    const exact = normalizedPlayerName(stat.name);
    const short = playerShortKey(stat.name);
    [`${team}|name:${exact}`, `name:${exact}`, `${team}|short:${short}`, `short:${short}`]
      .filter((key) => !key.endsWith(":"))
      .forEach((key) => {
        if (!(key in candidates)) candidates[key] = stat;
        else if (candidates[key]?.name !== stat.name || candidates[key]?.team !== stat.team) candidates[key] = null;
      });
  });
  internationalStatsIndex = candidates;
}

function internationalStatForPlayer(player) {
  const team = canonicalNationalTeam(player.team || "");
  const exact = normalizedPlayerName(player.name);
  const short = playerShortKey(player.name);
  return internationalStatsIndex[`${team}|name:${exact}`]
    || internationalStatsIndex[`name:${exact}`]
    || internationalStatsIndex[`${team}|short:${short}`]
    || internationalStatsIndex[`short:${short}`]
    || null;
}

async function loadInternationalStats() {
  rebuildInternationalStatsIndex();
  if (internationalStats.length) {
    populatePublicSquadCache();
    renderFantasyPicks();
    return internationalStats;
  }
  try {
    const url = "https://en.wikipedia.org/w/api.php?action=parse&page=2026_FIFA_World_Cup_squads&prop=text&format=json&formatversion=2&origin=*";
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const documentCopy = new DOMParser().parseFromString(payload?.parse?.text || "", "text/html");
    const records = [];
    let currentTeam = "";
    documentCopy.body.querySelectorAll("h3, table.wikitable").forEach((element) => {
      if (element.tagName === "H3") {
        currentTeam = element.querySelector(".mw-headline")?.textContent.trim()
          || element.textContent.replace(/\[edit\]/gi, "").trim();
        return;
      }
      const headers = [...element.querySelectorAll("tr:first-child th")]
        .map((cell) => normalizedPlayerName(cell.textContent));
      const playerIndex = headers.findIndex((header) => header === "player");
      const numberIndex = headers.findIndex((header) => header === "no");
      const positionIndex = headers.findIndex((header) => header === "pos");
      const capsIndex = headers.findIndex((header) => header === "caps");
      const goalsIndex = headers.findIndex((header) => header === "goals");
      if (!currentTeam || playerIndex < 0 || capsIndex < 0 || goalsIndex < 0) return;
      [...element.querySelectorAll("tr")].slice(1).forEach((row) => {
        const cells = [...row.querySelectorAll(":scope > th, :scope > td")];
        const name = cells[playerIndex]?.textContent
          .replace(/\[[^\]]*\]/g, "")
          .replace(/\s*\(captain\)\s*/gi, " ")
          .trim();
        const caps = Number.parseInt(cells[capsIndex]?.textContent, 10);
        const goals = Number.parseInt(cells[goalsIndex]?.textContent, 10);
        if (name && Number.isFinite(caps) && Number.isFinite(goals)) {
          records.push({
            name,
            team: currentTeam,
            number: Number.parseInt(cells[numberIndex]?.textContent, 10) || null,
            position: wikipediaPosition(cells[positionIndex]?.textContent),
            caps,
            goals
          });
        }
      });
    });
    if (records.length < 500) throw new Error("Spielerstatistik unvollständig");
    internationalStats = records;
    localStorage.setItem(internationalStatsStorageKey, JSON.stringify(records));
    rebuildInternationalStatsIndex();
    populatePublicSquadCache();
    renderFantasyPicks();
    return records;
  } catch (error) {
    console.warn("Länderspielstatistik konnte nicht aktualisiert werden:", error);
    return [];
  }
}

function ensureInternationalStats() {
  internationalStatsPromise ||= loadInternationalStats();
  return internationalStatsPromise;
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

function tournamentDnaScore(teamName) {
  const normalized = normalizedTeamName(teamName);
  const alias = Object.keys(worldCupFinalRecord)
    .find((name) => normalized.includes(name) || name.includes(normalized));
  const record = worldCupFinalRecord[normalized] || worldCupFinalRecord[alias] || { titles: 0, finals: 0 };
  return (record.finals * 4) + (record.titles * 2);
}

function dnaTip(match) {
  const difference = rankFor(match.away) - rankFor(match.home);
  if (Math.abs(difference) <= 8) return "1:1";
  return difference > 0 ? (difference >= 25 ? "2:0" : "2:1") : (difference <= -25 ? "0:2" : "1:2");
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
  if (strategy === "dna") return dnaTip(match);
  if (strategy === "stat") return statTip(match);
  if (strategy === "rank") return rankTip(match);
  return dogTip(match, member.id);
}

function automaticProfileTips(profile, strategy) {
  return Object.fromEntries(tournamentSchedule.filter(isMatchOpen).map((match) => {
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
    tournamentSchedule.filter(isMatchOpen).map((match) => {
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
  youth: "Jugend",
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

function updateRoundSummary() {
  const summary = document.querySelector("#round-summary");
  const humanCount = teams.reduce((count, team) =>
    count + team.members.filter((member) => !member.bot).length, 0);
  const teamCount = teams.length;
  if (summary) summary.textContent = `${humanCount} Teilnehmer · ${teamCount} Team${teamCount === 1 ? "" : "s"}`;
  const participantMetric = document.querySelector("#metric-participants");
  const matchMetric = document.querySelector("#metric-matches");
  if (participantMetric) participantMetric.textContent = humanCount;
  if (matchMetric) matchMetric.textContent = tournamentSchedule.length ? allTippableMatches().length : "\u2013";
}

function updateHomeRanking() {
  const rankLabel = document.querySelector("#home-rank");
  const rankCopy = document.querySelector("#home-rank-copy");
  if (!rankLabel || !rankCopy) return;
  const ranked = profileStandings.map((profile) => ({
    ...profile,
    total: Number(profile.tipPoints || 0) + Number(profile.fantasyPoints || 0)
  })).sort((a, b) => b.total - a.total || a.display_name.localeCompare(b.display_name, "de"));
  const hasEvaluation = ranked.some((profile) => profile.total > 0);
  const activeName = window.TippRadarCloud?.activeProfile?.display_name;
  const ownIndex = ranked.findIndex((profile) => profile.display_name === activeName);
  if (!hasEvaluation || ownIndex < 0) {
    rankLabel.textContent = "Noch keine Wertung";
    rankCopy.textContent = "Nach dem ersten ausgewerteten Spiel erscheint hier dein Rang.";
    return;
  }
  rankLabel.textContent = `Rang ${ownIndex + 1} von ${ranked.length}`;
  rankCopy.textContent = `${ranked[ownIndex].total} Punkte in der aktuellen Gesamtwertung.`;
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
  const idGoals = player.id && !String(player.id).startsWith("wiki-")
    ? scorerTotals[`id:${player.id}`]
    : null;
  const worldCupGoals = Number(idGoals || scorerTotals[`name:${normalizedTeamName(player.name)}`] || 0);
  const international = internationalStatForPlayer(player);
  const internationalLabel = international
    ? ` \u00b7 ${international.goals} Tore / ${international.caps} LS \u00b7 ${(international.caps ? (international.goals / international.caps) * 10 : 0).toFixed(1).replace(".", ",")} je 10 LS`
    : "";
  return `${player.name} \u00b7 ${positionLabel(player.position)}${number}${internationalLabel}${worldCupGoals ? ` \u00b7 WM: ${worldCupGoals}` : ""}`;
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
        <option value="">${pick.national_team ? (cached?.players?.length ? "Spieler w\u00e4hlen" : "Kader wird geladen") : "Zuerst Mannschaft w\u00e4hlen"}</option>
        ${playerOptions.map((player) => `<option value="${player.id}" ${String(player.id) === String(pick.player_id) ? "selected" : ""}>${escapeHtml(playerOptionLabel(player))}</option>`).join("")}
      </select>
    </label>`;
  }).join("");
  document.querySelector("#fantasy-counter").textContent = `${fantasyPicks.length} / 5 gew\u00e4hlt`;
  fantasyPicks.filter((pick) => pick.national_team && !squadCache[normalizedTeamName(pick.national_team)]?.players?.length)
    .forEach((pick) => loadSquadForSlot(pick.slot, pick.national_team, pick.player_id));
}

function collectFantasyPicks() {
  return Array.from({ length: 5 }, (_, index) => {
    const slot = index + 1;
    const playerSelect = document.querySelector(`[data-fantasy-player="${slot}"]`);
    const teamSelect = document.querySelector(`[data-fantasy-team="${slot}"]`);
    const cached = squadCache[normalizedTeamName(teamSelect.value)];
    const selectedPlayerData = cached?.players?.find((player) => String(player.id) === playerSelect.value);
    return {
      slot,
      player_id: playerSelect.value && selectedPlayerData?.source !== "wikipedia"
        ? Number(playerSelect.value)
        : null,
      player_name: playerSelect.value
        ? (selectedPlayerData?.name || "")
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
    if (!squadCache[cacheKey]?.players?.length) {
      squadRequests[cacheKey] ||= window.TippRadarCloud.loadTeamSquad(teamName);
      squadCache[cacheKey] = await squadRequests[cacheKey];
      if (!squadCache[cacheKey]?.players?.length) {
        await ensureInternationalStats();
        squadCache[cacheKey] = publicSquadForTeam(teamName)
          || await loadPublicSquadFallback(teamName).catch(() => null)
          || squadCache[cacheKey];
      }
      squadCache[cacheKey].cachedAt = new Date().toISOString();
      localStorage.setItem(squadStorageKey, JSON.stringify(squadCache));
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
    await ensureInternationalStats();
    if (!squadCache[cacheKey]?.players?.length) {
      const publicSquad = publicSquadForTeam(teamName)
        || await loadPublicSquadFallback(teamName).catch(() => null);
      if (publicSquad) {
        squadCache[cacheKey] = publicSquad;
        localStorage.setItem(squadStorageKey, JSON.stringify(squadCache));
      }
    }
    const currentSelect = document.querySelector(`[data-fantasy-player="${slot}"]`);
    if (squadCache[cacheKey]?.players?.length) {
      if (currentSelect) {
        currentSelect.disabled = false;
        currentSelect.innerHTML = `<option value="">Spieler w&auml;hlen / letzter Stand</option>${squadCache[cacheKey].players.map((player) =>
          `<option value="${player.id}" ${String(player.id) === String(selectedPlayerId) ? "selected" : ""}>${escapeHtml(playerOptionLabel(player))}</option>`
        ).join("")}`;
      }
      const sourceText = squadCache[cacheKey].source === "wikipedia"
        ? "öffentlicher WM-Kaderstand"
        : `gespeicherte Version vom ${new Intl.DateTimeFormat("de-DE").format(new Date(squadCache[cacheKey].cachedAt || Date.now()))}`;
      showToast("Kader geladen", `${teamName}: ${sourceText}.`);
      return;
    }
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
  select.innerHTML = matches.length
    ? matches.map((match) =>
      `<option value="${match.id}">${escapeHtml(match.home)} - ${escapeHtml(match.away)}${match.result ? ` (${match.result})` : ""}</option>`
    ).join("")
    : '<option value="">Spielplan wird geladen</option>';
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
  updateRoundSummary();
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
            <option value="youth">Jugendliche/r mit eigenem Zugang</option>
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
                        <option value="youth" ${participantRole(member) === "youth" ? "selected" : ""}>Jugend</option>
                        <option value="child" ${participantRole(member) === "child" ? "selected" : ""}>Kind</option>
                      </select>` : `<small class="role-badge ${participantRole(member)}">${participantRoleNames[participantRole(member)]}</small>`)}
                  <small class="team-badge" style="--team-color:${team.color}">${escapeHtml(team.name)}</small>
                  ${!member.bot && profileAutoStrategy(member.name) !== "manual"
                    ? `<small class="role-badge bot">AUTO · ${profileAutoStrategy(member.name).toUpperCase()}</small>`
                    : ""}
                </span>
                ${member.bot ? `<small>${botStrategyNames[member.strategy === "cooper" ? "stat" : (member.strategy || "dog")]}</small>` : ""}
              </span>
              ${canManageTeams && !member.bot && participantRole(member) !== "child" ? (() => {
                const linkedProfile = profileForName(member.name);
                const invite = participantInvites[member.name.trim().toLowerCase()];
                const inviteStatus = participantInviteStatus[member.name.trim().toLowerCase()];
                const linked = Boolean(linkedProfile?.account_user_id);
                return `<div class="member-invite ${linked ? "linked" : ""}">
                  <input type="email" data-field="invite-email" value="${escapeHtml(invite?.email || "")}" placeholder="E-Mail-Adresse" ${linked ? "disabled" : ""}>
                  <button data-action="invite-player" ${linked ? "disabled" : ""}>${linked ? "Zugang aktiv" : (invite ? "Erneut senden" : "Einladen")}</button>
                  ${inviteStatus
                    ? `<small class="${inviteStatus.type}">${escapeHtml(inviteStatus.text)}</small>`
                    : (invite && !linked ? `<small>Versendet ${new Intl.DateTimeFormat("de-DE").format(new Date(invite.invited_at))}</small>` : "")}
                </div>`;
              })() : ""}
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
  container.innerHTML = scoringRules.map((rule) => {
    const hierarchyLabel = ({
      exact: "1. Priorität",
      goal_difference: "2. Priorität",
      tendency: "3. Priorität",
      total_goals: "4. Priorität"
    })[rule.criterion];
    return `
    <label data-rule-id="${rule.id}">
      <span><i class="rule-dot ${rule.teamRule ? "team-bonus" : rule.id}"></i>${escapeHtml(rule.name)}${rule.teamRule ? "<small class=\"team-rule-label\">TEAM-BONUS</small>" : ""}${hierarchyLabel ? `<small class="priority-rule-label">${hierarchyLabel}</small>` : ""}</span>
      <input type="number" min="0" max="10" value="${rule.points}" data-action="rule-points" ${isOrganizer ? "" : "disabled"}>
      <small>Punkte</small>
      ${rule.locked || !isOrganizer ? "" : `<button class="rule-delete" data-action="delete-rule" aria-label="Kategorie l&ouml;schen">&times;</button>`}
    </label>`;
  }).join("");
  const total = Math.max(0, ...scoringRules.filter((rule) => !rule.teamRule).map((rule) => Number(rule.points)));
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
  const participantFilter = document.querySelector("#participant-filter");
  const pointsByName = Object.fromEntries(profileStandings.map((profile) => [
    profile.display_name, {
      total: Number(profile.tipPoints || 0) + Number(profile.fantasyPoints || 0),
      fantasy: Number(profile.fantasyPoints || 0)
    }
  ]));
  const allParticipants = currentParticipants().map((participant) => ({
    ...participant, points: pointsByName[participant.name] || { total: 0, fantasy: 0 }
  })).sort((a, b) => b.points.total - a.points.total)
    .map((participant, index) => ({ ...participant, overallRank: index + 1 }));
  if (participantFilter) {
    const availableIds = new Set(allParticipants.map((participant) => String(participant.id)));
    if (selectedParticipant !== "all" && !availableIds.has(selectedParticipant)) selectedParticipant = "all";
    participantFilter.innerHTML = `
      <option value="all">Alle Teilnehmer</option>
      ${allParticipants.map((participant) =>
        `<option value="${escapeHtml(String(participant.id))}" ${String(participant.id) === selectedParticipant ? "selected" : ""}>${escapeHtml(participant.name)} · ${escapeHtml(participant.team)}</option>`
      ).join("")}`;
  }
  const participants = selectedParticipant === "all"
    ? allParticipants
    : allParticipants.filter((participant) => String(participant.id) === selectedParticipant);
  body.innerHTML = participants.length ? participants.map((participant, index) => `
    <tr class="${participant.cooper ? "cooper-row" : ""}">
      <td><b class="rank-number">${participant.overallRank}</b></td>
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
  updateHomeRanking();
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
    `${row.profile_id}:${row.match_id}`, {
      goals: Number(row.goal_points || 0),
      wins: Number(row.win_points || 0),
      total: Number(row.goal_points || 0) + Number(row.win_points || 0)
    }
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

  function tipCategoryBreakdown(tip, result, counted) {
    if (!counted || !result) return [];
    const [actualHome, actualAway] = result.split(":").map(Number);
    const tipHome = Number(tip.home_score);
    const tipAway = Number(tip.away_score);
    const priorities = {
      exact: 1, goal_difference: 2, tendency: 3, total_goals: 4,
      home_goals: 5, away_goals: 6
    };
    const matches = scoringRules.filter((rule) => !rule.teamRule).map((rule) => {
      let matched = false;
      if (rule.criterion === "exact") matched = tipHome === actualHome && tipAway === actualAway;
      if (rule.criterion === "goal_difference") matched = tipHome - tipAway === actualHome - actualAway;
      if (rule.criterion === "tendency") matched = Math.sign(tipHome - tipAway) === Math.sign(actualHome - actualAway);
      if (rule.criterion === "total_goals") matched = tipHome + tipAway === actualHome + actualAway;
      if (rule.criterion === "home_goals") matched = tipHome === actualHome;
      if (rule.criterion === "away_goals") matched = tipAway === actualAway;
      return { name: rule.name, points: Number(rule.points || 0), priority: priorities[rule.criterion] || 99, matched };
    }).filter((item) => item.matched && item.points > 0)
      .sort((a, b) => a.priority - b.priority || b.points - a.points);
    return matches.length ? [{ name: matches[0].name, points: matches[0].points }] : [];
  }

  function matchBreakdown(match) {
    const counted = isMatchCounted(match);
    const profileRows = details.profileTips
      .filter((tip) => String(tip.match_id) === String(match.match_id))
      .map((tip) => {
        const tipPoints = counted ? Number(tip.points || 0) : 0;
        const fantasy = counted
          ? (fantasyByKey[`${tip.profile_id}:${tip.match_id}`] || { goals: 0, wins: 0, total: 0 })
          : { goals: 0, wins: 0, total: 0 };
        return {
          name: profileNames[tip.profile_id] || "Unbekannt",
          tip: `${tip.home_score}:${tip.away_score}`,
          tipPoints, top5: fantasy.total, total: tipPoints + fantasy.total,
          categories: tipCategoryBreakdown(tip, match.result, counted),
          fantasy
        };
      });
    const botRows = details.bots
      .filter((tip) => String(tip.match_id) === String(match.match_id))
      .map((tip) => ({
        name: `${tip.bot_name} (Auto)`, tip: `${tip.home_score}:${tip.away_score}`,
        tipPoints: counted ? Number(tip.points || 0) : 0, top5: 0,
        total: counted ? Number(tip.points || 0) : 0,
        categories: tipCategoryBreakdown(tip, match.result, counted),
        fantasy: { goals: 0, wins: 0, total: 0 }
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
                          <details class="participant-score-detail">
                            <summary title="Punkte von ${escapeHtml(row.name)} erkl&auml;ren">
                              <span><i></i><b>${escapeHtml(row.name)}</b><small>Punkte erkl&auml;ren</small></span>
                              <span>${row.tip}</span><span>${row.tipPoints}</span><span>${row.top5}</span><strong>${row.total}</strong>
                            </summary>
                            <div class="score-category-list">
                              <span class="score-result-note">Ergebnis ${escapeHtml(item.match.result || "\u2013")}</span>
                              ${row.categories.length ? row.categories.map((category) => `
                                <span><i></i>${escapeHtml(category.name)}<strong>+${category.points}</strong></span>
                              `).join("") : '<span><i></i>Keine Tippkategorie erf&uuml;llt<strong>+0</strong></span>'}
                              ${row.tipPoints !== row.categories.reduce((sum, category) => sum + category.points, 0)
                                ? `<span><i></i>Weitere gespeicherte Tippwertung<strong>+${row.tipPoints - row.categories.reduce((sum, category) => sum + category.points, 0)}</strong></span>`
                                : ""}
                              ${row.fantasy.goals ? `<span><i></i>Top 5: Tore<strong>+${row.fantasy.goals}</strong></span>` : ""}
                              ${row.fantasy.wins ? `<span><i></i>Top 5: Mannschaftssiege<strong>+${row.fantasy.wins}</strong></span>` : ""}
                            </div>
                          </details>
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
  svg.innerHTML = `<text x="450" y="155" text-anchor="middle" class="chart-empty-title">Noch kein Rangverlauf</text><text x="450" y="180" text-anchor="middle" class="chart-empty-copy">Sobald Rangstände je Spieltag gespeichert werden, erscheint hier die echte Entwicklung.</text>`;
  document.querySelector("#chart-legend").innerHTML = "";
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-range]").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  renderRankChart(button.dataset.range);
}));
document.querySelector("#participant-filter").addEventListener("change", (event) => {
  selectedParticipant = event.target.value;
  renderRanking();
});

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

document.querySelector("#date-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-match-view]");
  if (!button) return;
  savedTips = collectTips();
  localStorage.setItem(storageKey, JSON.stringify(savedTips));
  activeMatchView = button.dataset.matchView;
  localStorage.setItem(matchViewStorageKey, activeMatchView);
  applyMatchView();
  updateDateTabs(tournamentSchedule);
  renderMatches();
  document.querySelector("#matches-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("#refresh-simulation").addEventListener("click", () => {
  savedTips = collectTips();
  localStorage.setItem(storageKey, JSON.stringify(savedTips));
  renderTournamentSimulation();
  const modelName = document.querySelector("#simulation-model").selectedOptions[0]?.textContent || "Auswahl";
  showToast("Simulation aktualisiert", `Gruppentabellen und K.-o.-Projektion wurden mit ${modelName} neu berechnet.`);
});
document.querySelector("#simulation-model").addEventListener("change", (event) => {
  simulationModel = event.target.value;
  localStorage.setItem(simulationModelStorageKey, simulationModel);
  renderTournamentSimulation();
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

document.querySelector("#team-grid").addEventListener("click", async (event) => {
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
  if (action === "invite-player") {
    const memberRow = actionButton.closest("[data-member-id]");
    const member = team.members.find((item) => item.id === memberRow.dataset.memberId);
    const email = memberRow.querySelector('[data-field="invite-email"]')?.value.trim();
    if (!email) {
      showToast("E-Mail fehlt", "Bitte die E-Mail-Adresse des Teilnehmers eingeben.");
      return;
    }
    actionButton.disabled = true;
    actionButton.textContent = "Wird gesendet";
    const inviteKey = member.name.trim().toLowerCase();
    participantInviteStatus[inviteKey] = { type: "pending", text: "Einladung wird versendet ..." };
    try {
      const invites = await window.TippRadarCloud.inviteParticipant(member.name, email);
      participantInvites = Object.fromEntries(invites.map((invite) => [
        invite.display_name.trim().toLowerCase(), invite
      ]));
      participantInviteStatus[inviteKey] = { type: "success", text: `Anmeldelink an ${email} versendet.` };
      renderTeams();
      showToast("Einladung gesendet", `${member.name} erhält jetzt einen persönlichen Anmeldelink.`);
    } catch (error) {
      participantInvites[inviteKey] = {
        ...(participantInvites[inviteKey] || {}),
        display_name: member.name,
        email
      };
      participantInviteStatus[inviteKey] = { type: "error", text: error.message };
      renderTeams();
      showToast("Einladung nicht gesendet", error.message);
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

function ownedTippingProfiles(cloud) {
  if (!cloud?.session) return [];
  const ownProfiles = cloud.profiles.filter((profile) =>
    profile.account_user_id === cloud.session.user.id
    && (profile.is_primary || profile.profile_type === "child")
  );
  const primary = ownProfiles.find((profile) => profile.is_primary);
  if (primary?.profile_type !== "lead") return ownProfiles;
  const leadTeam = teams.find((team) => team.members.some((member) =>
    member.name.trim().toLowerCase() === primary.display_name.trim().toLowerCase()
    && participantRole(member) === "lead"
  ));
  if (!leadTeam) return ownProfiles;
  const teamNames = new Set(leadTeam.members.filter((member) => !member.bot)
    .map((member) => member.name.trim().toLowerCase()));
  return cloud.profiles.filter((profile) =>
    teamNames.has(profile.display_name.trim().toLowerCase())
  );
}

function profileOptionMarkup(profiles, activeProfile) {
  return profiles.map((profile) => {
    const team = teams.find((item) => item.members.some((member) =>
      member.name.trim().toLowerCase() === profile.display_name.trim().toLowerCase()
    ));
    const role = participantRoleNames[profile.profile_type] || "Erwachsen";
    return `<option value="${profile.id}" ${profile.id === activeProfile?.id ? "selected" : ""}>${escapeHtml(profile.display_name)} / ${role}${team ? ` / ${escapeHtml(team.name)}` : " / noch ohne Team"}</option>`;
  }).join("");
}

function updateProfileSelectors(cloud, ownedProfiles) {
  const options = profileOptionMarkup(ownedProfiles, cloud.activeProfile);
  const accountSelect = document.querySelector("#active-profile");
  const tipSelect = document.querySelector("#tip-active-profile");
  accountSelect.innerHTML = options;
  tipSelect.innerHTML = options;
  const primary = ownedProfiles.find((profile) => profile.is_primary);
  const childCount = ownedProfiles.filter((profile) => profile.profile_type === "child").length;
  document.querySelector("#tip-profile-heading").textContent =
    `${cloud.activeProfile?.display_name || primary?.display_name || "Profil"} tippt gerade`;
  document.querySelector("#tip-profile-access").textContent = primary?.profile_type === "lead"
    ? `Als Team-Lead kannst du dein eigenes Profil und ${childCount ? `${childCount} Kinderprofil${childCount === 1 ? "" : "e"}` : "angelegte Kinderprofile"} auswählen.`
    : "Mit deinem eigenen Zugang kannst du ausschließlich für dich selbst tippen.";
  if (primary?.profile_type === "lead") {
    const delegatedCount = Math.max(0, ownedProfiles.length - 1);
    document.querySelector("#tip-profile-access").textContent =
      `Als Team-Lead kannst du freie Tipps fuer dein gesamtes Team erfassen${delegatedCount ? ` (${delegatedCount} weitere Profile)` : ""}. Bereits gespeicherte Tipps von Erwachsenen und Jugendlichen koennen nur diese selbst aendern.`;
  }
  document.querySelector("#tip-profile-bar").hidden = false;
}

function updateAccountUi() {
  const cloud = window.TippRadarCloud;
  const avatar = document.querySelector("#account-avatar");
  document.querySelector("#tip-profile-bar").hidden = true;
  if (!cloud?.configured) {
    document.querySelector("#account-name").textContent = "Lokal";
    document.querySelector("#account-status").textContent = "Nur auf diesem Ger\u00e4t";
    if (avatar) avatar.textContent = "\u2013";
    setAccountPanel("cloud-unconfigured");
  } else if (!cloud.session) {
    document.querySelector("#account-name").textContent = "Anmelden";
    document.querySelector("#account-status").textContent = "Gemeinsam tippen";
    if (avatar) avatar.textContent = "?";
    setAccountPanel("cloud-login");
  } else if (!cloud.league) {
    document.querySelector("#account-name").textContent = cloud.session.user.email;
    document.querySelector("#account-status").textContent = "Runde ausw\u00e4hlen";
    if (avatar) avatar.textContent = initialsFor(cloud.session.user.email.split("@")[0]);
    setAccountPanel("cloud-onboarding");
  } else {
    document.querySelector("#account-name").textContent = cloud.activeProfile?.display_name || cloud.league.displayName;
    document.querySelector("#account-status").textContent = cloud.league.name;
    if (avatar) avatar.textContent = initialsFor(cloud.activeProfile?.display_name || cloud.league.displayName);
    document.querySelector("#cloud-league-name").textContent = cloud.league.name;
    document.querySelector("#cloud-invite-code").textContent = cloud.league.inviteCode;
    document.querySelector("#cloud-organizer-name").textContent =
      `${cloud.organizerName || "Unbekannt"}${cloud.league.role === "organizer" ? " (du)" : ""}`;
    document.querySelector("#scorer-admin").hidden = cloud.league.role !== "organizer";
    document.querySelector("#open-team-creator").hidden = cloud.league.role !== "organizer";
    const ownedProfiles = ownedTippingProfiles(cloud);
    const primaryProfile = ownedProfiles.find((profile) => profile.is_primary);
    document.querySelector("#current-account-type").value = cloud.league.accountType;
    document.querySelector('#current-account-type option[value="family"]').disabled =
      primaryProfile?.profile_type !== "lead" && cloud.league.role !== "organizer";
    updateProfileSelectors(cloud, ownedProfiles);
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
  updateHomeRanking();
}

async function syncFromCloud() {
  const cloud = window.TippRadarCloud;
  if (!cloud?.league) return;
  if (cloud.league.role === "organizer") {
    await cloud.syncSchedule([
      ...tournamentSchedule,
      ...projectionScheduleSlots().filter((slot) =>
        !tournamentSchedule.some((match) => String(match.id) === String(slot.id))
      )
    ]);
  }
  const [state, cloudTips] = await Promise.all([
    cloud.loadState(), cloud.loadPredictions()
  ]);
  const optionalResults = await Promise.allSettled([
    cloud.loadTeamScores(), cloud.loadLeaguePredictions(), cloud.loadFantasyPicks(),
    cloud.loadStandings(), cloud.loadPointDetails(), cloud.loadScorerTotals(),
    cloud.league.role === "organizer" ? cloud.loadParticipantInvites() : Promise.resolve([])
  ]);
  const [
    cloudTeamScoresResult, allTipsResult, cloudFantasyResult, standingsResult, detailsResult,
    scorerTotalsResult, participantInvitesResult
  ] = optionalResults;
  const cloudTeamScores = cloudTeamScoresResult.status === "fulfilled" ? cloudTeamScoresResult.value : {};
  const allTips = allTipsResult.status === "fulfilled" ? allTipsResult.value : {};
  const cloudFantasy = cloudFantasyResult.status === "fulfilled" ? cloudFantasyResult.value : [];
  const standings = standingsResult.status === "fulfilled" ? standingsResult.value : [];
  const details = detailsResult.status === "fulfilled" ? detailsResult.value : null;
  const loadedScorerTotals = scorerTotalsResult.status === "fulfilled" ? scorerTotalsResult.value : {};
  const loadedParticipantInvites = participantInvitesResult.status === "fulfilled" ? participantInvitesResult.value : [];
  const optionalFailures = optionalResults.filter((result) => result.status === "rejected");
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
  try {
    await cloud.syncCurrentParticipantRole();
  } catch (error) {
    console.warn("Teilnehmerrolle konnte nicht abgeglichen werden:", error);
  }
  const ownPrimaryProfile = cloud.profiles.find((profile) =>
    profile.account_user_id === cloud.session?.user?.id && profile.is_primary
  );
  if (ownPrimaryProfile?.profile_type === "lead") {
    try {
      await cloud.syncTeamParticipantProfiles();
    } catch (error) {
      console.warn("Teamprofile konnten nicht abgeglichen werden:", error);
    }
  }
  const manageableProfiles = ownedTippingProfiles(cloud);
  cloud.setManageableProfileIds(manageableProfiles.map((profile) => profile.id));
  savedTips = cloudTips;
  teamScoreSummary = cloudTeamScores;
  leaguePredictions = allTips;
  fantasyPicks = cloudFantasy;
  profileStandings = standings;
  pointDetails = details;
  scorerTotals = loadedScorerTotals;
  participantInvites = Object.fromEntries(loadedParticipantInvites.map((invite) => [
    invite.display_name.trim().toLowerCase(), invite
  ]));
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
  if (optionalFailures.length) {
    console.warn("Optionale Cloud-Bereiche konnten nicht geladen werden:", optionalFailures.map((result) => result.reason));
  }
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
    console.error("Cloud-Initialisierung fehlgeschlagen:", error);
    showToast("Anmeldung nicht vollständig geladen", error.message || "Bitte die Seite einmal neu laden.");
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
async function switchActiveProfile(profileId, sourceSelect) {
  const cloud = window.TippRadarCloud;
  if (!cloud?.activeProfile || profileId === cloud.activeProfile.id) return;
  const previousProfile = cloud.activeProfile;
  try {
    const draft = collectTips();
    await cloud.savePredictions(draft);
    const selected = cloud.selectProfile(profileId);
    if (!selected) throw new Error("Dieses Profil darf von deinem Konto nicht verwendet werden.");
    await syncFromCloud();
    showToast("Tipp-Profil gewechselt", `${cloud.activeProfile.display_name} tippt jetzt.`);
  } catch (error) {
    sourceSelect.value = previousProfile.id;
    showToast("Profil nicht gewechselt", error.message);
  }
}

document.querySelector("#active-profile").addEventListener("change", (event) =>
  switchActiveProfile(event.target.value, event.target)
);
document.querySelector("#tip-active-profile").addEventListener("change", (event) =>
  switchActiveProfile(event.target.value, event.target)
);
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
  await window.TippRadarCloud?.refreshSessionContext();
  updateAccountUi();
  await syncFromCloud();
});

function updateCountdown() {
  updateHomeHero(tournamentSchedule);
  updateDateTabs(tournamentSchedule);
  updateRoundSummary();
}

applyMatchView(tournamentSchedule);
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
ensureInternationalStats();
renderScorerMatches();
updateCountdown();
loadOpenLigaMatches();
initializeCloud();
