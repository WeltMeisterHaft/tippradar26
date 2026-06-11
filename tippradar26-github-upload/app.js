const demoMatches = [
  {
    id: "mex-za", time: "Do / 21:00", group: "Gruppe A / Mexico City",
    kickoff: "2026-06-11T21:00:00+02:00", matchday: "1",
    home: "Mexiko", away: "S\u00fcdafrika", homeFlag: "&#x1F1F2;&#x1F1FD;", awayFlag: "&#x1F1FF;&#x1F1E6;",
    crowd: "2:0", crowdPercent: 68
  },
  {
    id: "kor-cze", time: "Fr / 03:00", group: "Gruppe A / Guadalajara",
    kickoff: "2026-06-12T03:00:00+02:00", matchday: "1",
    home: "S\u00fcdkorea", away: "Tschechien", homeFlag: "&#x1F1F0;&#x1F1F7;", awayFlag: "&#x1F1E8;&#x1F1FF;",
    crowd: "1:1", crowdPercent: 42
  },
  {
    id: "can-bih", time: "Fr / 21:00", group: "Gruppe B / Toronto",
    kickoff: "2026-06-12T21:00:00+02:00", matchday: "1",
    home: "Kanada", away: "Bosnien-Herzegowina", homeFlag: "&#x1F1E8;&#x1F1E6;", awayFlag: "&#x1F1E7;&#x1F1E6;",
    crowd: "2:1", crowdPercent: 57
  }
];
let matches = [...demoMatches];

const teamStorageKey = "tippradar26-teams-v2";
const ruleStorageKey = "tippradar26-rules-v2";
let teams = JSON.parse(localStorage.getItem(teamStorageKey) || "[]");
let scoringRules = JSON.parse(localStorage.getItem(ruleStorageKey) || "null") || [
  { id: "exact", criterion: "exact", name: "Exaktes Ergebnis", points: 4, locked: true },
  { id: "difference", criterion: "goal_difference", name: "Richtige Tordifferenz", points: 3, locked: true },
  { id: "tendency", criterion: "tendency", name: "Richtige Tendenz", points: 2, locked: true },
  { id: "goals", criterion: "total_goals", name: "Richtige Gesamtzahl Tore", points: 1 },
  { id: "wrong", criterion: "wrong", name: "Falscher Tipp", points: 0, locked: true },
  { id: "team-match", criterion: "team_best_match", name: "Bestes Team je Spiel", points: 1, locked: true, teamRule: true },
  { id: "team-matchday", criterion: "team_best_matchday", name: "Bestes Team je Spieltag", points: 1, locked: true, teamRule: true }
];
const ruleTypeNames = {
  total_goals: "Richtige Gesamtzahl Tore",
  home_goals: "Richtige Tore Heimteam",
  away_goals: "Richtige Tore Ausw\u00e4rtsteam",
  goal_difference: "Richtiger Torunterschied"
};
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
let tournamentTeams = [...new Set(demoMatches.flatMap((match) => [match.home, match.away]))]
  .sort((a, b) => a.localeCompare(b, "de"));
const squadCache = {};
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
    group: `${apiMatch.group?.groupName || "WM 2026"} / ${apiMatch.location?.locationCity || "Austragungsort offen"}`,
    home: apiMatch.team1?.teamName || fallback.home,
    away: apiMatch.team2?.teamName || fallback.away,
    homeFlag: apiMatch.team1?.teamIconUrl ? `<img src="${apiMatch.team1.teamIconUrl}" alt="">` : fallback.homeFlag,
    awayFlag: apiMatch.team2?.teamIconUrl ? `<img src="${apiMatch.team2.teamIconUrl}" alt="">` : fallback.awayFlag,
    result: finalResult ? `${finalResult.pointsTeam1}:${finalResult.pointsTeam2}` : null,
    matchday: apiMatch.group?.groupOrderID || apiMatch.group?.groupName || "1",
    openLigaId: apiMatch.matchID
  };
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
    tournamentTeams = [...new Set(normalized.flatMap((match) => [match.home, match.away]))]
      .sort((a, b) => a.localeCompare(b, "de"));
    if (window.TippRadarCloud?.league?.role === "organizer") {
      await window.TippRadarCloud.syncSchedule(normalized);
    }
    const recentBoundary = Date.now() - (6 * 60 * 60 * 1000);
    const relevant = normalized.filter((match) => new Date(match.kickoff).getTime() >= recentBoundary);
    matches = (relevant.length ? relevant : normalized.slice(-12)).slice(0, 12);
    status.textContent = "Spielplan live von OpenLigaDB";
    status.parentElement.classList.add("connected");
    renderMatches();
    renderTipMatrix();
    renderFantasyPicks();
    if (window.TippRadarCloud?.league?.role === "organizer") {
      await syncApiFootballEvents(normalized);
      await Promise.all(matches.filter((match) => match.result).map((match) => {
        const [home, away] = match.result.split(":").map(Number);
        return window.TippRadarCloud.scoreMatch(match.id, match.matchday, home, away).catch(() => {});
      }));
      teamScoreSummary = await window.TippRadarCloud.loadTeamScores();
      renderTeams();
    }
  } catch (error) {
    status.textContent = "Demo-Spielplan / OpenLigaDB nicht erreichbar";
    status.parentElement.classList.add("fallback");
  }
}

function renderMatches() {
  matchesList.innerHTML = matches.map((match) => {
    const tip = savedTips[match.id] || {};
    const open = isMatchOpen(match);
    return `
      <article class="match-card ${open ? "" : "match-locked"}" data-match="${match.id}" data-kickoff="${match.kickoff}">
        <div class="match-meta"><strong>${match.time}</strong><span>${match.group}</span></div>
        <div class="match-teams">
          <div class="match-team"><span class="small-flag">${match.homeFlag}</span>${match.home}</div>
          <div class="match-team"><span class="small-flag">${match.awayFlag}</span>${match.away}</div>
        </div>
        <div class="score-inputs" aria-label="Ergebnis fuer ${match.home} gegen ${match.away}">
          <input class="score-input" data-side="home" type="number" min="0" max="20" inputmode="numeric" value="${tip.home ?? ""}" aria-label="Tore ${match.home}" ${open ? "" : "disabled"}>
          <span>:</span>
          <input class="score-input" data-side="away" type="number" min="0" max="20" inputmode="numeric" value="${tip.away ?? ""}" aria-label="Tore ${match.away}" ${open ? "" : "disabled"}>
        </div>
        <div class="match-insights">
          <div class="community-note">Community: <strong>${match.crowd}</strong> / ${match.crowdPercent}% sehen ${match.home} vorn</div>
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
        ${open ? "" : '<div class="locked-label">Tipp geschlossen</div>'}
      </article>`;
  }).join("");
  document.querySelectorAll(".score-input").forEach((input) => input.addEventListener("input", updateProgress));
  updateProgress();
  renderScorerMatches();
}

function isMatchOpen(match) {
  return !match.kickoff || Date.now() < new Date(match.kickoff).getTime();
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

function currentParticipants() {
  return teams.flatMap((team) => team.members.map((member) => ({
    id: member.id,
    name: member.name,
    initials: member.initials,
    color: member.bot ? "cooper-avatar" : "blue",
    cooper: member.bot,
    team: team.name
  })));
}

function fantasyStorageKey() {
  return `tippradar26-fantasy-${window.TippRadarCloud?.activeProfile?.id || "local"}`;
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
      ? [{ id: pick.player_id, name: pick.player_name }, ...players] : players;
    return `<label class="fantasy-pick">
      <span>${slot}</span>
      <select data-fantasy-team="${slot}">
        <option value="">Nationalmannschaft w&auml;hlen</option>
        ${teamOptions.map((team) => `<option value="${escapeHtml(team)}" ${team === pick.national_team ? "selected" : ""}>${escapeHtml(team)}</option>`).join("")}
      </select>
      <select data-fantasy-player="${slot}" ${pick.national_team ? "" : "disabled"}>
        <option value="">${pick.national_team ? (cached ? "Spieler w\u00e4hlen" : "Kader wird geladen") : "Zuerst Mannschaft w\u00e4hlen"}</option>
        ${playerOptions.map((player) => `<option value="${player.id}" ${String(player.id) === String(pick.player_id) ? "selected" : ""}>${escapeHtml(player.name)}</option>`).join("")}
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
      player_name: playerSelect.value ? (selectedPlayer?.textContent?.trim() || "") : "",
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
    squadCache[cacheKey] ||= await window.TippRadarCloud.loadTeamSquad(teamName);
    const players = squadCache[cacheKey].players || [];
    const currentSelect = document.querySelector(`[data-fantasy-player="${slot}"]`);
    if (!currentSelect) return;
    currentSelect.disabled = false;
    currentSelect.innerHTML = `<option value="">Spieler w&auml;hlen</option>${players.map((player) =>
      `<option value="${player.id}" ${String(player.id) === String(selectedPlayerId) ? "selected" : ""}>${escapeHtml(player.name)}</option>`
    ).join("")}`;
  } catch (error) {
    if (playerSelect) playerSelect.innerHTML = '<option value="">Kader nicht erreichbar</option>';
    showToast("Kader nicht geladen", `${teamName}: ${error.message}`);
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
              <i class="mini-avatar ${participant.color}">${participant.initials}</i>
              <strong>${participant.name}</strong>
              ${participant.cooper ? "<small>Auto-Tipp</small>" : ""}
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
  if (!teams.length) {
    grid.innerHTML = `
      <div class="empty-teams">
        <span class="empty-ball">&#9673;</span>
        <h2>Noch keine Teams angelegt</h2>
        <p>Starte mit eurem ersten Team. Danach kannst du Menschen oder kostenlose automatische Tipp-Spieler hinzuf&uuml;gen.</p>
        <button class="primary-button" data-action="open-team">Erstes Team anlegen</button>
      </div>`;
    return;
  }
  grid.innerHTML = teams.map((team) => {
    const weightedTotal = team.members.reduce((sum, member) => sum + member.weight, 0);
    const score = teamScoreSummary[team.id] || { base: 0, matchBonus: 0, matchdayBonus: 0 };
    const totalScore = score.base + score.matchBonus + score.matchdayBonus;
    return `
      <article class="team-card" data-team-id="${team.id}">
        <div class="team-card-head">
          <div><span class="team-rank" style="background:${team.color}">${team.name.slice(0, 2).toUpperCase()}</span><span><strong>${escapeHtml(team.name)}</strong><small>${team.members.length} Spieler</small></span></div>
          <div class="team-head-right">
            <span class="team-live-points"><strong>${totalScore.toFixed(1)}</strong> Teampunkte</span>
            <div class="team-actions"><button data-action="toggle-player-form">+ Spieler</button><button class="danger-button" data-action="delete-team" title="Team l&ouml;schen">&times;</button></div>
          </div>
        </div>
        <div class="player-form" hidden>
          <input data-field="player-name" type="text" maxlength="24" placeholder="Name des Spielers">
          <select data-field="player-type"><option value="human">Mensch</option><option value="bot">Automatischer Tipp-Spieler</option></select>
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
              <span class="mini-avatar ${member.bot ? "cooper-avatar" : "blue"}">${member.initials}</span>
              <span class="member-name"><strong>${escapeHtml(member.name)}</strong>${member.bot ? `<small>${botStrategyNames[member.strategy === "cooper" ? "stat" : (member.strategy || "dog")]}</small>` : "<small>SPIELER</small>"}</span>
              <label class="weight-control">
                <span>Faktor <b>${member.weight.toFixed(2)}</b></span>
                <input type="range" min="0.75" max="1.25" step="0.05" value="${member.weight}" data-action="weight">
              </label>
              <button class="member-delete" data-action="delete-player" title="Spieler l&ouml;schen">&times;</button>
            </div>`).join("") : `<div class="empty-members">Noch keine Spieler. F&uuml;ge den ersten Teilnehmer hinzu.</div>`}
        </div>
        <div class="team-card-foot">
          <span style="background:${team.color}"></span>
          Summe der Faktoren: <strong>${weightedTotal.toFixed(2)}</strong> / ${team.members.length}
          <em>${team.members.length ? "automatisch ausgeglichen" : "noch ohne Gewichtung"}</em>
        </div>
        <div class="team-bonus-strip">
          <span>Basis <strong>${score.base.toFixed(1)}</strong></span>
          <span>Beste Spiele <strong>+${score.matchBonus.toFixed(1)}</strong></span>
          <span>Beste Spieltage <strong>+${score.matchdayBonus.toFixed(1)}</strong></span>
        </div>
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
  container.innerHTML = scoringRules.map((rule) => `
    <label data-rule-id="${rule.id}">
      <span><i class="rule-dot ${rule.teamRule ? "team-bonus" : rule.id}"></i>${escapeHtml(rule.name)}${rule.teamRule ? "<small class=\"team-rule-label\">TEAM-BONUS</small>" : ""}</span>
      <input type="number" min="0" max="10" value="${rule.points}" data-action="rule-points">
      <small>Punkte</small>
      ${rule.locked ? "" : `<button class="rule-delete" data-action="delete-rule" aria-label="Kategorie l&ouml;schen">&times;</button>`}
    </label>`).join("");
  const total = scoringRules.filter((rule) => !rule.teamRule).reduce((sum, rule) => sum + Number(rule.points), 0);
  document.querySelector("#rule-count").textContent = `${scoringRules.length} Kategorien`;
  document.querySelector("#rule-total").textContent = `${total} Punkte`;
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
      <td><span class="mini-avatar ${participant.color}">${participant.initials}</span><strong>${escapeHtml(participant.name)}</strong><small> ${escapeHtml(participant.team)}</small></td>
      <td><span class="trend flat">${participant.points.fantasy ? `Top 5 +${participant.points.fantasy}` : "&ndash;"}</span></td><td>0</td><td><strong>${participant.points.total}</strong></td>
    </tr>`).join("") : `
    <tr><td colspan="5" class="ranking-empty">Noch keine Spieler angelegt. Die Rangliste f&uuml;llt sich mit eurer Runde.</td></tr>`;
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
  teams.push({ id: makeId("team"), name, color: document.querySelector("#team-color").value, members: [] });
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
    team.members.push({ id: makeId("player"), name, initials: initialsFor(name), bot, strategy, weight: 1 });
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
    const strategy = event.target.closest(".player-form").querySelector('[data-field="bot-strategy"]');
    strategy.hidden = event.target.value !== "bot";
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
  if (event.target.dataset.action !== "rule-points") return;
  const rule = scoringRules.find((item) => item.id === event.target.closest("[data-rule-id]").dataset.ruleId);
  rule.points = Number(event.target.value || 0);
  renderRules();
});
document.querySelector("#rule-inputs").addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="delete-rule"]');
  if (!button) return;
  const id = button.closest("[data-rule-id]").dataset.ruleId;
  scoringRules = scoringRules.filter((rule) => rule.id !== id);
  renderRules();
});
document.querySelector("#add-rule").addEventListener("click", () => {
  const criterion = document.querySelector("#new-rule-type").value;
  scoringRules.push({
    id: makeId("rule"),
    criterion,
    name: ruleTypeNames[criterion],
    points: Number(document.querySelector("#new-rule-points").value || 0)
  });
  renderRules();
});
document.querySelector("#save-rules").addEventListener("click", () => {
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
    document.querySelector("#scorer-admin").hidden = cloud.league.role !== "organizer";
    const ownedProfiles = cloud.profiles.filter((profile) => profile.account_user_id === cloud.session.user.id);
    document.querySelector("#current-account-type").value = cloud.league.accountType;
    const profileSelect = document.querySelector("#active-profile");
    profileSelect.innerHTML = ownedProfiles.map((profile) =>
      `<option value="${profile.id}" ${profile.id === cloud.activeProfile?.id ? "selected" : ""}>${escapeHtml(profile.display_name)}${profile.profile_type === "child" ? " / Kind" : ""}</option>`
    ).join("");
    document.querySelector("#family-profile-creator").hidden = cloud.league.accountType !== "family";
    setAccountPanel("cloud-account");
  }
}

async function syncFromCloud() {
  const cloud = window.TippRadarCloud;
  if (!cloud?.league) return;
  const [state, cloudTips, cloudTeamScores, allTips, cloudFantasy, standings] = await Promise.all([
    cloud.loadState(), cloud.loadPredictions(), cloud.loadTeamScores(), cloud.loadLeaguePredictions(),
    cloud.loadFantasyPicks(), cloud.loadStandings()
  ]);
  if (state) {
    teams = Array.isArray(state.teams) ? state.teams : teams;
    scoringRules = Array.isArray(state.scoring_rules) && state.scoring_rules.length ? state.scoring_rules : scoringRules;
    ensureTeamBonusRules();
    localStorage.setItem(teamStorageKey, JSON.stringify(teams));
    localStorage.setItem(ruleStorageKey, JSON.stringify(scoringRules));
  }
  savedTips = cloudTips;
  teamScoreSummary = cloudTeamScores;
  leaguePredictions = allTips;
  fantasyPicks = cloudFantasy;
  profileStandings = standings;
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
  renderFantasyPicks();
  updateAccountUi();
}

async function initializeCloud() {
  try {
    await window.TippRadarCloud?.init();
    updateAccountUi();
    await syncFromCloud();
    if (window.TippRadarCloud?.league?.role === "organizer") await loadOpenLigaMatches();
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
    showToast("Kinderprofil angelegt", `${name} kann jetzt eigene Tipps abgeben.`);
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
  const kickoff = new Date("2026-06-11T21:00:00+02:00");
  const diff = kickoff - new Date();
  const element = document.querySelector("#countdown");
  if (diff <= 0) { element.textContent = "wenigen Momenten"; return; }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  element.textContent = days > 0 ? `${days} Tag${days === 1 ? "" : "en"}` : `${hours} Stunden`;
}

renderMatches();
ensureTeamBonusRules();
renderRankChart();
renderTipMatrix();
renderTeams();
renderRules();
renderRanking();
fantasyPicks = JSON.parse(localStorage.getItem(fantasyStorageKey()) || "[]");
renderFantasyPicks();
renderScorerMatches();
updateCountdown();
loadOpenLigaMatches();
initializeCloud();
