const SESSION_SECONDS = 24 * 60 * 60;
const authRate = new Map();
const scriptRate = new Map();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "pragma": "no-cache",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "x-content-type-options": "nosniff",
    },
  });
}

function rateLimited(store, id, windowMs, limit) {
  const slot = Math.floor(Date.now() / windowMs);
  const current = store.get(id);
  if (!current || current.slot !== slot) {
    store.set(id, { slot, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

function bytesToBase64Url(bytes) {
  let raw = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    raw += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
  }
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function sha256Hex(value) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))),
  );
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sessionKey(env) {
  if (!env.SESSION_SIGNING_KEY) throw new Error("SESSION_SIGNING_KEY missing");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function issueSession(env, userId, opts = {}) {
  const expiresAtMs = Number.isFinite(opts.expiresAtMs)
    ? Number(opts.expiresAtMs)
    : Date.now() + SESSION_SECONDS * 1000;

  const payload = {
    v: 2,
    uid: Number(userId),
    exp: Math.floor(expiresAtMs / 1000),
    perm: opts.permanent === true,
    admin: opts.admin === true,
    manual: opts.manual === true,
  };

  const payloadPart = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await sessionKey(env),
      new TextEncoder().encode(payloadPart),
    ),
  );

  return {
    session: "a7v2." + payloadPart + "." + bytesToBase64Url(signature),
    expires_at: new Date(expiresAtMs).toISOString(),
    session_seconds: Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)),
    permanent: payload.perm,
    admin: payload.admin,
    manual: payload.manual,
  };
}

async function verifySignedSession(env, token, userId) {
  if (typeof token !== "string" || !token.startsWith("a7v2.")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await sessionKey(env),
      base64UrlToBytes(parts[2]),
      new TextEncoder().encode(parts[1]),
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(parts[1])),
    );
    if (
      Number(payload?.v) !== 2 ||
      Number(payload?.uid) !== Number(userId) ||
      Number(payload?.exp) <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function extractToken(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const u = new URL(text);
    return (
      u.searchParams.get("token") ||
      u.searchParams.get("key") ||
      u.searchParams.get("code") ||
      u.pathname.split("/").filter(Boolean).pop() ||
      text
    );
  } catch {
    return text;
  }
}

async function verifyWorkInk(env, rawKey) {
  const token = extractToken(rawKey);
  if (!token) return false;
  const base = env.WORKINK_VERIFY_URL || "https://work.ink/_api/v2/token/isValid/";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(
      base + encodeURIComponent(token) + "?deleteToken=1",
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    return !!data && data.valid === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function manualGrant(env, userId) {
  const row = await env.DB.prepare(
    `SELECT user_id, username, permanent, expires_at, active, label
       FROM manual_grants
      WHERE user_id = ?1 AND active = 1
      LIMIT 1`,
  ).bind(Number(userId)).first();

  if (!row) return null;
  if (Number(row.permanent) === 1) return row;
  if (!row.expires_at) return null;
  return new Date(String(row.expires_at)).getTime() > Date.now() ? row : null;
}

async function verifyLegacySession(env, token, userId) {
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT token_hash, user_id, expires_at
       FROM legacy_sessions
      WHERE token_hash = ?1 AND user_id = ?2
      LIMIT 1`,
  ).bind(tokenHash, Number(userId)).first();

  if (row && new Date(String(row.expires_at)).getTime() > Date.now()) {
    return { legacy: true };
  }

  return null;
}

async function verifyAnySession(env, token, userId) {
  return (
    await verifySignedSession(env, token, userId)
  ) || (
    await verifyLegacySession(env, token, userId)
  );
}

async function getActiveScript(env, gameKey) {
  return env.DB.prepare(
    `SELECT
        a.game_key,
        v.id AS version_id,
        v.version,
        v.sha256,
        v.r2_key,
        v.created_at
      FROM active_scripts a
      JOIN script_versions v ON v.id = a.version_id
      WHERE a.game_key = ?1
      LIMIT 1`,
  ).bind(gameKey).first();
}

async function serveScript(env, body) {
  const userId = Number(body?.user_id);
  const session = String(body?.session ?? "").trim();
  const gameKey = String(body?.game ?? "").trim();

  if (!Number.isFinite(userId) || userId <= 0) return json({ ok: false, error: "invalid_user" }, 400);
  if (!session || !gameKey) return json({ ok: false, error: "missing_session_or_game" }, 400);
  if (rateLimited(scriptRate, userId, 60_000, 30)) return json({ ok: false, error: "rate_limited" }, 429);

  const validSession = await verifyAnySession(env, session, userId);
  if (!validSession) return json({ ok: false, error: "invalid_or_expired_session" }, 401);

  const meta = await getActiveScript(env, gameKey);
  if (!meta) return json({ ok: false, error: "script_not_found" }, 404);

  const object = await env.SCRIPTS.get(String(meta.r2_key));
  if (!object) return json({ ok: false, error: "script_temporarily_unavailable" }, 503);

  const source = await object.text();
  const actualSha = await sha256Hex(source);
  if (actualSha !== String(meta.sha256)) {
    return json({ ok: false, error: "script_integrity_error" }, 503);
  }

  const watermark =
    "-- A7DEV LICENSE | uid=" + userId +
    " | session=" + session.slice(0, 12) +
    " | game=" + gameKey +
    " | version=" + meta.version +
    " | issued=" + new Date().toISOString() + "\n";

  return new Response(watermark + source, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "pragma": "no-cache",
      "access-control-allow-origin": "*",
      "x-a7dev-version": String(meta.version),
      "x-a7dev-sha256": actualSha,
      "x-content-type-options": "nosniff",
    },
  });
}

async function authorize(env, body) {
  const userId = Number(body?.user_id);
  if (!Number.isFinite(userId) || userId <= 0) return json({ ok: false, error: "invalid_user" }, 400);
  if (rateLimited(authRate, userId, 10 * 60_000, 20)) return json({ ok: false, error: "rate_limited" }, 429);

  const rawKey = String(body?.key ?? "").trim();
  if (!rawKey) return json({ ok: false, error: "missing_key" }, 400);

  let valid = false;
  let admin = false;
  if (env.ADMIN_KEY_SHA256 && await sha256Hex(rawKey) === env.ADMIN_KEY_SHA256) {
    valid = true;
    admin = true;
  } else {
    valid = await verifyWorkInk(env, rawKey);
  }

  if (!valid) return json({ ok: false, error: "invalid_or_expired_key" }, 401);

  const issued = await issueSession(env, userId, { admin });
  return json({
    ok: true,
    session: issued.session,
    expires_at: issued.expires_at,
    session_seconds: issued.session_seconds,
    admin,
    permanent: false,
  });
}

async function claimManualGrant(env, body) {
  const userId = Number(body?.user_id);
  if (!Number.isFinite(userId) || userId <= 0) return json({ ok: false, error: "invalid_user" }, 400);

  const grant = await manualGrant(env, userId);
  if (!grant) return json({ ok: false, error: "no_active_manual_grant" }, 404);

  const permanent = Number(grant.permanent) === 1;
  const expiresAtMs = permanent || !grant.expires_at
    ? Date.now() + SESSION_SECONDS * 1000
    : Math.min(
        new Date(String(grant.expires_at)).getTime(),
        Date.now() + SESSION_SECONDS * 1000,
      );

  const issued = await issueSession(env, userId, {
    permanent,
    manual: true,
    expiresAtMs,
  });

  return json({
    ok: true,
    session: issued.session,
    expires_at: issued.expires_at,
    session_seconds: issued.session_seconds,
    admin: false,
    manual: true,
    permanent,
  });
}

function adminAuthorized(request, env) {
  const expected = String(env.ADMIN_API_TOKEN || "");
  if (!expected) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === "Bearer " + expected;
}

function safePart(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100);
}

async function stageScript(request, env) {
  if (!adminAuthorized(request, env)) return json({ ok: false, error: "forbidden" }, 403);
  const body = await request.json().catch(() => null);
  const gameKey = String(body?.game_key ?? "").trim();
  const version = String(body?.version ?? "").trim();
  const source = typeof body?.source === "string" ? body.source : "";
  const expectedActiveSha = body?.expected_active_sha256 ? String(body.expected_active_sha256) : "";

  if (!gameKey || !version || !source) return json({ ok: false, error: "missing_game_version_or_source" }, 400);

  const current = await getActiveScript(env, gameKey);
  if (expectedActiveSha && String(current?.sha256 || "") !== expectedActiveSha) {
    return json({
      ok: false,
      error: "active_version_changed",
      active_sha256: current?.sha256 || null,
    }, 409);
  }

  const sha = await sha256Hex(source);
  const r2Key =
    "scripts/" + safePart(gameKey) + "/" +
    new Date().toISOString().replace(/[:.]/g, "-") + "-" +
    safePart(version) + "-" + sha.slice(0, 16) + ".lua";

  await env.SCRIPTS.put(r2Key, source, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
    customMetadata: { game_key: gameKey, version, sha256: sha, state: "staging" },
  });

  try {
    const result = await env.DB.prepare(
      `INSERT INTO script_versions(game_key, version, sha256, r2_key, state, created_at)
       VALUES(?1, ?2, ?3, ?4, 'staging', ?5)
       RETURNING id`,
    ).bind(gameKey, version, sha, r2Key, new Date().toISOString()).first();

    return json({
      ok: true,
      state: "staging",
      version_id: result?.id,
      game_key: gameKey,
      version,
      sha256: sha,
      r2_key: r2Key,
    });
  } catch (error) {
    await env.SCRIPTS.delete(r2Key).catch(() => {});
    throw error;
  }
}

async function activateVersion(env, gameKey, versionId) {
  const target = await env.DB.prepare(
    `SELECT id, game_key, version, sha256, r2_key, state
       FROM script_versions
      WHERE id = ?1 AND game_key = ?2
      LIMIT 1`,
  ).bind(Number(versionId), gameKey).first();

  if (!target) throw new Error("version_not_found");

  const object = await env.SCRIPTS.get(String(target.r2_key));
  if (!object) throw new Error("r2_object_missing");
  const source = await object.text();
  const actualSha = await sha256Hex(source);
  if (actualSha !== String(target.sha256)) throw new Error("r2_integrity_mismatch");

  const current = await getActiveScript(env, gameKey);
  const now = new Date().toISOString();
  const statements = [];

  if (current?.version_id && Number(current.version_id) !== Number(target.id)) {
    statements.push(
      env.DB.prepare(
        "UPDATE script_versions SET state='archived' WHERE id=?1",
      ).bind(Number(current.version_id)),
    );
  }

  statements.push(
    env.DB.prepare(
      `INSERT INTO active_scripts(game_key, version_id, updated_at)
       VALUES(?1, ?2, ?3)
       ON CONFLICT(game_key)
       DO UPDATE SET version_id=excluded.version_id, updated_at=excluded.updated_at`,
    ).bind(gameKey, Number(target.id), now),
  );
  statements.push(
    env.DB.prepare(
      "UPDATE script_versions SET state='active' WHERE id=?1",
    ).bind(Number(target.id)),
  );

  await env.DB.batch(statements);

  return {
    game_key: gameKey,
    version_id: Number(target.id),
    version: target.version,
    sha256: target.sha256,
  };
}

async function activateScript(request, env) {
  if (!adminAuthorized(request, env)) return json({ ok: false, error: "forbidden" }, 403);
  const body = await request.json().catch(() => null);
  const gameKey = String(body?.game_key ?? "").trim();
  const versionId = Number(body?.version_id);
  const expectedActiveSha = body?.expected_active_sha256 ? String(body.expected_active_sha256) : "";

  if (!gameKey || !Number.isFinite(versionId)) return json({ ok: false, error: "missing_game_or_version" }, 400);

  const current = await getActiveScript(env, gameKey);
  if (expectedActiveSha && String(current?.sha256 || "") !== expectedActiveSha) {
    return json({ ok: false, error: "active_version_changed", active_sha256: current?.sha256 || null }, 409);
  }

  try {
    const active = await activateVersion(env, gameKey, versionId);
    return json({ ok: true, active });
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 409);
  }
}

async function rollbackScript(request, env) {
  if (!adminAuthorized(request, env)) return json({ ok: false, error: "forbidden" }, 403);
  const body = await request.json().catch(() => null);
  const gameKey = String(body?.game_key ?? "").trim();
  let versionId = Number(body?.version_id);

  if (!gameKey) return json({ ok: false, error: "missing_game" }, 400);

  if (!Number.isFinite(versionId)) {
    const current = await getActiveScript(env, gameKey);
    const row = await env.DB.prepare(
      `SELECT id
         FROM script_versions
        WHERE game_key=?1
          AND state='archived'
          AND id<>COALESCE(?2, -1)
        ORDER BY id DESC
        LIMIT 1`,
    ).bind(gameKey, Number(current?.version_id || -1)).first();
    versionId = Number(row?.id);
  }

  if (!Number.isFinite(versionId)) return json({ ok: false, error: "rollback_version_not_found" }, 404);

  try {
    const active = await activateVersion(env, gameKey, versionId);
    return json({ ok: true, rollback: active });
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 409);
  }
}

async function adminStatus(request, env) {
  if (!adminAuthorized(request, env)) return json({ ok: false, error: "forbidden" }, 403);
  const rows = await env.DB.prepare(
    `SELECT a.game_key, v.id AS version_id, v.version, v.sha256, v.r2_key, a.updated_at
       FROM active_scripts a
       JOIN script_versions v ON v.id=a.version_id
       ORDER BY a.game_key`,
  ).all();
  return json({ ok: true, active: rows.results || [] });
}

async function health(env) {
  try {
    await env.DB.prepare("SELECT 1").first();
    return json({ ok: true, service: "a7dev-cloudflare", database: "ok" });
  } catch (error) {
    return json({ ok: false, service: "a7dev-cloudflare", database: "error" }, 503);
  }
}

async function hubApi(request, env) {
  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");

  if (action === "authorize") return authorize(env, body);
  if (action === "manual_grant") return claimManualGrant(env, body);
  if (action === "script") return serveScript(env, body);
  return json({ ok: false, error: "unknown_action" }, 400);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return json({ ok: true });

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return health(env);

    if (request.method === "POST" && (url.pathname === "/" || url.pathname === "/v1/hub")) {
      return hubApi(request, env);
    }

    if (request.method === "POST" && url.pathname === "/admin/scripts/stage") {
      return stageScript(request, env);
    }
    if (request.method === "POST" && url.pathname === "/admin/scripts/activate") {
      return activateScript(request, env);
    }
    if (request.method === "POST" && url.pathname === "/admin/scripts/rollback") {
      return rollbackScript(request, env);
    }
    if (request.method === "GET" && url.pathname === "/admin/status") {
      return adminStatus(request, env);
    }

    return json({ ok: false, error: "not_found" }, 404);
  },
};
