const SUPABASE_URL = process.env.SUPABASE_URL || "https://mfcuiwavqeexvnzskxkz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || "sb_publishable_jYOCjfwISxabYA2x9FkDnw_e_gfYkyB";

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
  const redirectTo = String(request.body?.redirectTo || "").trim();

  if (!userToken || !displayName || !email || !redirectTo) {
    send(response, 400, { ok: false, error: "Name, E-Mail und Anmeldung werden benötigt." });
    return;
  }

  try {
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
      body: JSON.stringify({ target_name: displayName, target_email: email })
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
