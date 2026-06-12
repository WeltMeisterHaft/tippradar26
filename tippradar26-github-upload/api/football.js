const API_BASE = "https://v3.football.api-sports.io";
const SUPABASE_URL = "https://mfcuiwavqeexvnzskxkz.supabase.co";
const SUPABASE_KEY = "sb_publishable_jYOCjfwISxabYA2x9FkDnw_e_gfYkyB";

function send(response, status, body, maxAge = 300) {
  response.status(status);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", status >= 400
    ? "private, no-store"
    : `s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
  response.end(JSON.stringify(body));
}

async function apiRequest(path, key) {
  const result = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": key }
  });
  const body = await result.json();
  if (!result.ok) {
    throw new Error(body?.message || `API-Football antwortet mit ${result.status}`);
  }
  const apiErrors = body?.errors;
  const errorMessages = Array.isArray(apiErrors)
    ? apiErrors.filter(Boolean)
    : Object.values(apiErrors || {}).filter(Boolean);
  if (errorMessages.length) {
    const message = errorMessages.map((error) =>
      typeof error === "string" ? error : JSON.stringify(error)
    ).join(" / ");
    if (/limit|request|plan/i.test(message)) {
      throw new Error(`Kostenlose API-Grenze erreicht oder Tarifzugriff fehlt: ${message}`);
    }
    throw new Error(message);
  }
  return body;
}

function berlinDate(offsetDays = 0) {
  const date = new Date(Date.now() + (offsetDays * 86400000));
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

async function authenticatedUser(request) {
  const authorization = String(request.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) return null;
  const result = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: authorization }
  });
  if (!result.ok) return null;
  return result.json();
}

async function membershipFor(request, user) {
  const result = await fetch(
    `${SUPABASE_URL}/rest/v1/league_members?user_id=eq.${user.id}&select=league_id,role&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: request.headers.authorization } }
  );
  if (!result.ok) return null;
  return (await result.json())[0] || null;
}

const teamAliases = {
  "deutschland": "Germany", "spanien": "Spain", "frankreich": "France",
  "england": "England", "brasilien": "Brazil", "argentinien": "Argentina",
  "niederlande": "Netherlands", "belgien": "Belgium", "kroatien": "Croatia",
  "italien": "Italy", "kolumbien": "Colombia", "vereinigte staaten": "USA",
  "sudkorea": "South Korea", "sudafrika": "South Africa", "mexiko": "Mexico",
  "schweiz": "Switzerland", "osterreich": "Austria", "turkei": "Turkey",
  "danemark": "Denmark", "agypten": "Egypt", "elfenbeinkuste": "Ivory Coast",
  "neuseeland": "New Zealand", "saudi-arabien": "Saudi Arabia",
  "bosnien-herzegowina": "Bosnia and Herzegovina", "tschechien": "Czech Republic",
  "kanada": "Canada", "japan": "Japan", "marokko": "Morocco",
  "senegal": "Senegal", "uruguay": "Uruguay", "ecuador": "Ecuador",
  "australien": "Australia", "norwegen": "Norway", "ukraine": "Ukraine",
  "polen": "Poland", "schottland": "Scotland", "serbien": "Serbia",
  "paraguay": "Paraguay", "algerien": "Algeria", "tunesien": "Tunisia",
  "nigeria": "Nigeria", "kamerun": "Cameroon", "costa rica": "Costa Rica",
  "katar": "Qatar", "irak": "Iraq", "jamaika": "Jamaica",
  "usbekistan": "Uzbekistan", "jordanien": "Jordan",
  "kap verde": "Cape Verde", "curacao": "Curaçao",
  "bosnien und herzegowina": "Bosnia and Herzegovina"
};

function plain(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

module.exports = async function handler(request, response) {
  const key = process.env.API_FOOTBALL_KEY;
  const syncToken = process.env.API_FOOTBALL_SYNC_TOKEN;
  if (!key || !syncToken) {
    send(response, 503, {
      ok: false,
      error: "API_FOOTBALL_KEY oder API_FOOTBALL_SYNC_TOKEN ist in Vercel noch nicht eingerichtet."
    });
    return;
  }

  const providedToken = String(request.headers["x-sync-token"] || request.query.token || "");
  const user = await authenticatedUser(request);
  const membership = user ? await membershipFor(request, user) : null;
  if (providedToken !== syncToken && !membership) {
    send(response, 401, { ok: false, error: "Zugriff nicht erlaubt." });
    return;
  }

  const action = String(request.query.action || "probe");

  try {
    if (action === "public-squad") {
      const requestedName = String(request.query.team || "").trim();
      if (!requestedName) {
        send(response, 400, { ok: false, error: "Nationalmannschaft wird benoetigt." });
        return;
      }
      const searchName = teamAliases[plain(requestedName)] || requestedName;
      const page = "2026 FIFA World Cup squads";
      const sectionsResponse = await fetch(
        `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=sections&format=json&formatversion=2`
      );
      if (!sectionsResponse.ok) throw new Error(`Wikipedia antwortet mit ${sectionsResponse.status}`);
      const sectionsBody = await sectionsResponse.json();
      const section = (sectionsBody?.parse?.sections || []).find((item) =>
        String(item.level) === "3" && plain(item.line) === plain(searchName)
      );
      if (!section) {
        send(response, 404, { ok: false, error: `Oeffentlicher WM-Kader fuer ${requestedName} nicht gefunden.` });
        return;
      }
      const squadResponse = await fetch(
        `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&section=${section.index}&prop=text&format=json&formatversion=2`
      );
      if (!squadResponse.ok) throw new Error(`Wikipedia antwortet mit ${squadResponse.status}`);
      const squadBody = await squadResponse.json();
      const html = squadBody?.parse?.text || "";
      if (!html) {
        send(response, 502, { ok: false, error: `Oeffentlicher WM-Kader fuer ${requestedName} ist leer.` });
        return;
      }
      send(response, 200, {
        ok: true,
        requestedName,
        team: searchName,
        source: "wikipedia",
        html
      }, 86400);
      return;
    }

    if (action === "probe") {
      const today = berlinDate();
      const [status, fixtures] = await Promise.all([
        apiRequest("/status", key),
        apiRequest(`/fixtures?date=${today}`, key)
      ]);
      const worldCupFixtures = (fixtures.response || []).filter((item) =>
        item.league?.id === 1 || /world cup/i.test(item.league?.name || "")
      );
      send(response, 200, {
        ok: true,
        date: today,
        requests: status.response?.requests || null,
        fixtureErrors: fixtures.errors || {},
        fixtureResults: fixtures.results || 0,
        worldCupResults: worldCupFixtures.length,
        fixtures: worldCupFixtures.map((item) => ({
          id: item.fixture?.id,
          date: item.fixture?.date,
          status: item.fixture?.status?.short,
          leagueId: item.league?.id,
          league: item.league?.name,
          home: item.teams?.home?.name,
          away: item.teams?.away?.name,
          homeTeamId: item.teams?.home?.id,
          awayTeamId: item.teams?.away?.id
        }))
      });
      return;
    }

    if (action === "day") {
      const date = String(request.query.date || berlinDate());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        send(response, 400, { ok: false, error: "Datum im Format YYYY-MM-DD benoetigt." });
        return;
      }
      const fixtures = await apiRequest(`/fixtures?date=${date}`, key);
      const worldCupFixtures = (fixtures.response || []).filter((item) =>
        item.league?.id === 1 || /world cup/i.test(item.league?.name || "")
      );
      send(response, 200, {
        ok: true,
        date,
        fixtures: worldCupFixtures.map((item) => ({
          id: item.fixture?.id,
          date: item.fixture?.date,
          status: item.fixture?.status?.short,
          home: item.teams?.home?.name,
          away: item.teams?.away?.name,
          homeTeamId: item.teams?.home?.id,
          awayTeamId: item.teams?.away?.id,
          homeGoals: item.goals?.home,
          awayGoals: item.goals?.away
        }))
      });
      return;
    }

    if (action === "team-squad") {
      const requestedName = String(request.query.team || "").trim();
      if (!requestedName) {
        send(response, 400, { ok: false, error: "Nationalmannschaft wird benoetigt." });
        return;
      }
      const searchName = teamAliases[plain(requestedName)] || requestedName;
      const teams = await apiRequest(`/teams?search=${encodeURIComponent(searchName)}`, key);
      const candidates = teams.response || [];
      const selected = candidates.find((item) => item.team?.national && (
        plain(item.team.name) === plain(searchName) || plain(item.team.name).includes(plain(searchName))
      )) || candidates.find((item) => item.team?.national);
      if (!selected?.team?.id) {
        send(response, 404, { ok: false, error: `Kein Nationalteam fuer ${requestedName} gefunden.` });
        return;
      }
      const squad = await apiRequest(`/players/squads?team=${selected.team.id}`, key);
      const players = (squad.response || []).flatMap((team) =>
        (team.players || []).map((player) => ({
          id: player.id, name: player.name, position: player.position,
          number: player.number, teamId: selected.team.id, team: selected.team.name
        }))
      ).sort((a, b) => a.name.localeCompare(b.name));
      send(response, 200, {
        ok: true, requestedName, teamId: selected.team.id,
        team: selected.team.name, players,
        available: players.length > 0,
        message: players.length ? null : `Der Kader von ${requestedName} ist bei API-Football noch nicht veroeffentlicht.`
      }, 86400);
      return;
    }

    if (action === "events") {
      if (membership?.role !== "organizer" && providedToken !== syncToken) {
        send(response, 403, { ok: false, error: "Nur der Organisator darf Ereignisse synchronisieren." });
        return;
      }
      const fixture = String(request.query.fixture || "");
      if (!/^\d+$/.test(fixture)) {
        send(response, 400, { ok: false, error: "Eine numerische fixture-ID wird benoetigt." });
        return;
      }
      const events = await apiRequest(`/fixtures/events?fixture=${fixture}`, key);
      send(response, 200, {
        ok: true,
        errors: events.errors || {},
        events: (events.response || []).map((event) => ({
          minute: event.time?.elapsed,
          extra: event.time?.extra,
          team: event.team?.name,
          teamId: event.team?.id,
          player: event.player?.name,
          playerId: event.player?.id,
          type: event.type,
          detail: event.detail,
          comments: event.comments
        }))
      }, 60);
      return;
    }

    if (action === "fixture-check") {
      const fixture = String(request.query.fixture || "");
      const homeTeam = String(request.query.homeTeam || "");
      const awayTeam = String(request.query.awayTeam || "");
      if (![fixture, homeTeam, awayTeam].every((value) => /^\d+$/.test(value))) {
        send(response, 400, {
          ok: false,
          error: "Numerische fixture-, homeTeam- und awayTeam-IDs werden benoetigt."
        });
        return;
      }
      const [events, homeSquad, awaySquad] = await Promise.all([
        apiRequest(`/fixtures/events?fixture=${fixture}`, key),
        apiRequest(`/players/squads?team=${homeTeam}`, key),
        apiRequest(`/players/squads?team=${awayTeam}`, key)
      ]);
      send(response, 200, {
        ok: true,
        eventErrors: events.errors || {},
        eventResults: events.results || 0,
        events: (events.response || []).map((event) => ({
          minute: event.time?.elapsed,
          team: event.team?.name,
          player: event.player?.name,
          type: event.type,
          detail: event.detail
        })),
        homeSquadErrors: homeSquad.errors || {},
        homeSquadResults: homeSquad.results || 0,
        homeSquad: (homeSquad.response || []).flatMap((team) =>
          (team.players || []).map((player) => ({
            id: player.id, name: player.name, position: player.position,
            number: player.number, team: team.team?.name
          }))
        ),
        awaySquadErrors: awaySquad.errors || {},
        awaySquadResults: awaySquad.results || 0,
        awaySquad: (awaySquad.response || []).flatMap((team) =>
          (team.players || []).map((player) => ({
            id: player.id, name: player.name, position: player.position,
            number: player.number, team: team.team?.name
          }))
        )
      });
      return;
    }

    if (action === "squad") {
      const team = String(request.query.team || "");
      if (!/^\d+$/.test(team)) {
        send(response, 400, { ok: false, error: "Eine numerische team-ID wird benoetigt." });
        return;
      }
      const squad = await apiRequest(`/players/squads?team=${team}`, key);
      send(response, 200, {
        ok: true,
        errors: squad.errors || {},
        response: squad.response || []
      });
      return;
    }

    send(response, 400, { ok: false, error: "Unbekannte Aktion." });
  } catch (error) {
    send(response, 502, { ok: false, error: error.message });
  }
};
