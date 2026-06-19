const SUPABASE_URL = process.env.SUPABASE_URL || "https://mfcuiwavqeexvnzskxkz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || "sb_publishable_jYOCjfwISxabYA2x9FkDnw_e_gfYkyB";
const APP_ORIGIN = process.env.APP_ORIGIN || "https://tippradar26.vercel.app";
const INVITABLE_ROLES = new Set(["lead", "adult", "youth"]);

function send(response, status, body) {
  response.status(status);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store");
  response.end(JSON.stringify(body));
}

async function jsonRequest(url, options) {
  const result = await fetch(url, options);
  const body = await result.json().catch(() => ({}));
  if (!result.ok) {
    const error = new Error(body?.msg || body?.message || body?.error_description || body?.error || `HTTP ${result.status}`);
    error.status = result.status;
    throw error;
  }
  return body;
}

function inviteRedirectUrl() {
  const url = new URL(APP_ORIGIN);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("APP_ORIGIN muss eine sichere HTTPS-Adresse sein.");
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    send(response, 405, { ok: false, error: "Nur POST ist erlaubt." });
    return;
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    send(response, 503, {
      ok: false,
      code: "missing_secret",
      error: "In Vercel fehlt SUPABASE_SECRET_KEY."
    });
    return;
  }

  const userToken = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const displayName = String(request.body?.displayName || "").trim();
  const email = String(request.body?.email || "").trim().toLowerCase();
  const role = String(request.body?.role || "").trim().toLowerCase();

  if (!userToken || !displayName || !email || !role) {
    send(response, 400, { ok: false, error: "Name, E-Mail und Anmeldung werden benötigt." });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    send(response, 400, { ok: false, error: "Die E-Mail-Adresse ist nicht gültig." });
    return;
  }
  if (!INVITABLE_ROLES.has(role)) {
    send(response, 400, { ok: false, error: "Diese Teilnehmerrolle kann nicht eingeladen werden." });
    return;
  }

  try {
    const redirectTo = inviteRedirectUrl();
    await jsonRequest(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${userToken}`
      }
    });

    await jsonRequest(`${SUPABASE_URL}/rest/v1/rpc/set_participant_invite`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${userToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ target_name: displayName, target_email: email, target_role: role })
    });

    try {
      await jsonRequest(`${SUPABASE_URL}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST",
        headers: {
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });
    } catch (error) {
      if (!/already|registered|exists/i.test(error.message)) throw error;
      await jsonRequest(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, create_user: true })
      });
    }

    send(response, 200, { ok: true });
  } catch (error) {
    const rateLimited = error.status === 429 || /rate limit|rate_limit|too many/i.test(error.message);
    send(response, rateLimited ? 429 : 400, {
      ok: false,
      code: rateLimited ? "rate_limited" : "invite_failed",
      error: rateLimited
        ? "Zu viele E-Mails in kurzer Zeit. Bitte etwa eine Minute warten und erneut senden."
        : error.message
    });
  }
};
