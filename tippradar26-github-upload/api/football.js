const API_BASE = "https://v3.football.api-sports.io";

function send(response, status, body) {
  response.status(status);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
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
  return body;
}

function berlinDate(offsetDays = 0) {
  const date = new Date(Date.now() + (offsetDays * 86400000));
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
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
  if (providedToken !== syncToken) {
    send(response, 401, { ok: false, error: "Zugriff nicht erlaubt." });
    return;
  }

  const action = String(request.query.action || "probe");

  try {
    if (action === "probe") {
      const today = berlinDate();
      const [status, league, fixtures] = await Promise.all([
        apiRequest("/status", key),
        apiRequest("/leagues?id=1&season=2026", key),
        apiRequest(`/fixtures?league=1&season=2026&date=${today}`, key)
      ]);
      send(response, 200, {
        ok: true,
        date: today,
        requests: status.response?.requests || null,
        leagueErrors: league.errors || {},
        leagueResults: league.results || 0,
        fixtureErrors: fixtures.errors || {},
        fixtureResults: fixtures.results || 0,
        fixtures: (fixtures.response || []).map((item) => ({
          id: item.fixture?.id,
          date: item.fixture?.date,
          status: item.fixture?.status?.short,
          home: item.teams?.home?.name,
          away: item.teams?.away?.name
        }))
      });
      return;
    }

    if (action === "events") {
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
          player: event.player?.name,
          type: event.type,
          detail: event.detail
        }))
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
