const demoMatches = [
  {
    id: "mex-za", time: "Do / 21:00", group: "Gruppe A / Mexico City",
    home: "Mexiko", away: "S\u00fcdafrika", homeFlag: "&#x1F1F2;&#x1F1FD;", awayFlag: "&#x1F1FF;&#x1F1E6;",
    crowd: "2:0", crowdPercent: 68, odds: [1.44, 4.20, 7.50], cooper: "2:0", confidence: 69
  },
  {
    id: "kor-cze", time: "Fr / 03:00", group: "Gruppe A / Guadalajara",
    home: "S\u00fcdkorea", away: "Tschechien", homeFlag: "&#x1F1F0;&#x1F1F7;", awayFlag: "&#x1F1E8;&#x1F1FF;",
    crowd: "1:1", crowdPercent: 42, odds: [2.70, 3.10, 2.65], cooper: "1:1", confidence: 36
  },
  {
    id: "can-bih", time: "Fr / 21:00", group: "Gruppe B / Toronto",
    home: "Kanada", away: "Bosnien-Herzegowina", homeFlag: "&#x1F1E8;&#x1F1E6;", awayFlag: "&#x1F1E7;&#x1F1E6;",
    crowd: "2:1", crowdPercent: 57, odds: [1.92, 3.55, 3.85], cooper: "2:1", confidence: 51
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
  { id: "wrong", criterion: "wrong", name: "Falscher Tipp", points: 0, locked: true }
];
const ruleTypeNames = {
  total_goals: "Richtige Gesamtzahl Tore",
  home_goals: "Richtige Tore Heimteam",
  away_goals: "Richtige Tore Ausw\u00e4rtsteam",
  goal_difference: "Richtiger Torunterschied"
};

const storageKey = "tippradar26-tips";
let savedTips = JSON.parse(localStorage.getItem(storageKey) || "{}");
let selectedSeries = null;
const matchesList = document.querySelector("#matches-list");
const toast = document.querySelector("#toast");

function fairProbabilities(odds) {
  const raw = odds.map((odd) => 1 / odd);
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => Math.round((value / total) * 100));
}

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
    time: formatMatchTime(apiMatch.matchDateTime),
    group: `${apiMatch.group?.groupName || "WM 2026"} / ${apiMatch.location?.locationCity || "Austragungsort offen"}`,
    home: apiMatch.team1?.teamName || fallback.home,
    away: apiMatch.team2?.teamName || fallback.away,
    homeFlag: apiMatch.team1?.teamIconUrl ? `<img src="${apiMatch.team1.teamIconUrl}" alt="">` : fallback.homeFlag,
    awayFlag: apiMatch.team2?.teamIconUrl ? `<img src="${apiMatch.team2.teamIconUrl}" alt="">` : fallback.awayFlag,
    result: finalResult ? `${finalResult.pointsTeam1}:${finalResult.pointsTeam2}` : null,
    openLigaId: apiMatch.matchID
  };
}

async function loadOpenLigaMatches() {
  const status = document.querySelector("#match-data-status");
  try {
    const response = await fetch("https://api.openligadb.de/getmatchdata/wm26/2026");
    if (!response.ok) throw new Error(`OpenLigaDB ${response.status}`);
    const data = await response.json();
    const relevant = data
      .filter((match) => match.team1 && match.team2)
      .sort((a, b) => new Date(a.matchDateTime) - new Date(b.matchDateTime))
      .slice(0, 3);
    if (!relevant.length) throw new Error("Keine WM-Spiele gefunden");
    matches = relevant.map(normalizeOpenLigaMatch);
    status.textContent = "Spielplan live von OpenLigaDB";
    status.parentElement.classList.add("connected");
    renderMatches();
    renderTipMatrix();
    if (window.TippRadarCloud?.league?.role === "organizer") {
      matches.filter((match) => match.result).forEach((match) => {
        const [home, away] = match.result.split(":").map(Number);
        window.TippRadarCloud.scoreMatch(match.id, home, away).catch(() => {});
      });
    }
  } catch (error) {
    status.textContent = "Demo-Spielplan / OpenLigaDB nicht erreichbar";
    status.parentElement.classList.add("fallback");
  }
}

function renderMatches() {
  matchesList.innerHTML = matches.map((match) => {
    const tip = savedTips[match.id] || {};
    const probabilities = fairProbabilities(match.odds);
    return `
      <article class="match-card" data-match="${match.id}">
        <div class="match-meta"><strong>${match.time}</strong><span>${match.group}</span></div>
        <div class="match-teams">
          <div class="match-team"><span class="small-flag">${match.homeFlag}</span>${match.home}</div>
          <div class="match-team"><span class="small-flag">${match.awayFlag}</span>${match.away}</div>
        </div>
        <div class="score-inputs" aria-label="Ergebnis fuer ${match.home} gegen ${match.away}">
          <input class="score-input" data-side="home" type="number" min="0" max="20" inputmode="numeric" value="${tip.home ?? ""}" aria-label="Tore ${match.home}">
          <span>:</span>
          <input class="score-input" data-side="away" type="number" min="0" max="20" inputmode="numeric" value="${tip.away ?? ""}" aria-label="Tore ${match.away}">
        </div>
        <div class="match-insights">
          <div class="community-note">Community: <strong>${match.crowd}</strong> / ${match.crowdPercent}% sehen ${match.home} vorn</div>
          <div class="cooper-pick">
            <span class="cooper-badge">C</span>
            <span><small>COOPER tippt</small><strong>${match.cooper}</strong></span>
            <span class="confidence">${match.confidence}% Sicherheit</span>
          </div>
        </div>
        <div class="odds-strip">
          <span><small>1</small><b>${match.odds[0].toFixed(2)}</b><i>${probabilities[0]}%</i></span>
          <span><small>X</small><b>${match.odds[1].toFixed(2)}</b><i>${probabilities[1]}%</i></span>
          <span><small>2</small><b>${match.odds[2].toFixed(2)}</b><i>${probabilities[2]}%</i></span>
        </div>
      </article>`;
  }).join("");
  document.querySelectorAll(".score-input").forEach((input) => input.addEventListener("input", updateProgress));
  updateProgress();
}

function collectTips() {
  const tips = {};
  document.querySelectorAll(".match-card").forEach((card) => {
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
  if (participant.cooper) return match.cooper;
  return "\u2013";
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
              ${participant.cooper ? "<small>Quoten</small>" : ""}
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
        <p>Starte mit eurem ersten Team. Danach kannst du Menschen oder einen Quoten-Spieler wie COOPER hinzuf&uuml;gen.</p>
        <button class="primary-button" data-action="open-team">Erstes Team anlegen</button>
      </div>`;
    return;
  }
  grid.innerHTML = teams.map((team) => {
    const weightedTotal = team.members.reduce((sum, member) => sum + member.weight, 0);
    return `
      <article class="team-card" data-team-id="${team.id}">
        <div class="team-card-head">
          <div><span class="team-rank" style="background:${team.color}">${team.name.slice(0, 2).toUpperCase()}</span><span><strong>${escapeHtml(team.name)}</strong><small>${team.members.length} Spieler</small></span></div>
          <div class="team-actions"><button data-action="toggle-player-form">+ Spieler</button><button class="danger-button" data-action="delete-team" title="Team l&ouml;schen">&times;</button></div>
        </div>
        <div class="player-form" hidden>
          <input data-field="player-name" type="text" maxlength="24" placeholder="Name des Spielers">
          <select data-field="player-type"><option value="human">Mensch</option><option value="bot">Quoten-Spieler wie COOPER</option></select>
          <button data-action="create-player">Hinzuf&uuml;gen</button>
        </div>
        <div class="team-members">
          ${team.members.length ? team.members.map((member, index) => `
            <div class="member-admin" data-member-id="${member.id}">
              <span class="member-position">${index + 1}</span>
              <span class="mini-avatar ${member.bot ? "cooper-avatar" : "blue"}">${member.initials}</span>
              <span class="member-name"><strong>${escapeHtml(member.name)}</strong>${member.bot ? "<small>QUOTEN-SPIELER</small>" : "<small>SPIELER</small>"}</span>
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
      <span><i class="rule-dot ${rule.id}"></i>${escapeHtml(rule.name)}</span>
      <input type="number" min="0" max="10" value="${rule.points}" data-action="rule-points">
      <small>Punkte</small>
      ${rule.locked ? "" : `<button class="rule-delete" data-action="delete-rule" aria-label="Kategorie l&ouml;schen">&times;</button>`}
    </label>`).join("");
  const total = scoringRules.reduce((sum, rule) => sum + Number(rule.points), 0);
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
  const participants = currentParticipants();
  body.innerHTML = participants.length ? participants.map((participant, index) => `
    <tr class="${participant.cooper ? "cooper-row" : ""}">
      <td><b class="rank-number">${index + 1}</b></td>
      <td><span class="mini-avatar ${participant.color}">${participant.initials}</span><strong>${escapeHtml(participant.name)}</strong><small> ${escapeHtml(participant.team)}</small></td>
      <td><span class="trend flat">&ndash;</span></td><td>0</td><td><strong>0</strong></td>
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

document.querySelector("#save-tips").addEventListener("click", () => {
  savedTips = collectTips();
  localStorage.setItem(storageKey, JSON.stringify(savedTips));
  if (window.TippRadarCloud?.league) {
    window.TippRadarCloud.savePredictions(savedTips).catch(() => {
      showToast("Lokal gespeichert", "Die Cloud-Synchronisierung ist gerade nicht erreichbar.");
    });
  }
  updateProgress();
  showToast("Tipps gespeichert", "Viel Erfolg!");
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
    team.members.push({ id: makeId("player"), name, initials: initialsFor(name), bot, weight: 1 });
    persistTeams();
    renderTeams();
    renderTipMatrix();
    renderRanking();
    renderRankChart();
    showToast(`${name} hinzugef\u00fcgt`, `Faktor 1,00 in ${team.name}`);
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
    document.querySelector("#account-name").textContent = cloud.league.displayName;
    document.querySelector("#account-status").textContent = cloud.league.name;
    document.querySelector("#cloud-league-name").textContent = cloud.league.name;
    document.querySelector("#cloud-invite-code").textContent = cloud.league.inviteCode;
    setAccountPanel("cloud-account");
  }
}

async function syncFromCloud() {
  const cloud = window.TippRadarCloud;
  if (!cloud?.league) return;
  const [state, cloudTips] = await Promise.all([cloud.loadState(), cloud.loadPredictions()]);
  if (state) {
    teams = Array.isArray(state.teams) ? state.teams : teams;
    scoringRules = Array.isArray(state.scoring_rules) && state.scoring_rules.length ? state.scoring_rules : scoringRules;
    localStorage.setItem(teamStorageKey, JSON.stringify(teams));
    localStorage.setItem(ruleStorageKey, JSON.stringify(scoringRules));
  }
  savedTips = cloudTips;
  localStorage.setItem(storageKey, JSON.stringify(savedTips));
  renderTeams();
  renderRules();
  renderMatches();
  renderTipMatrix();
  renderRanking();
}

async function initializeCloud() {
  try {
    await window.TippRadarCloud?.init();
    updateAccountUi();
    await syncFromCloud();
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
    updateAccountUi();
    await window.TippRadarCloud.saveState(teams, scoringRules);
    showToast("Tipprunde erstellt", `Einladungscode: ${code.toUpperCase()}`);
  } catch (error) {
    showToast("Erstellen fehlgeschlagen", error.message);
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
renderRankChart();
renderTipMatrix();
renderTeams();
renderRules();
renderRanking();
updateCountdown();
loadOpenLigaMatches();
initializeCloud();
