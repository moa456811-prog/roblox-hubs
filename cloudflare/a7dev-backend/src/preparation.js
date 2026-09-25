// Preparation entrypoint: no license validation or script delivery before import verification.
export default {
  async fetch(request, env) {
    let database = "unchecked";
    let storage = "unchecked";
    if (request.method === "GET" && new URL(request.url).pathname === "/health") {
      try {
        await env.DB.prepare("SELECT 1").first();
        database = "ok";
      } catch { database = "error"; }
      try {
        await env.SCRIPTS.list({ limit: 1 });
        storage = "ok";
      } catch { storage = "error"; }
    }
    return Response.json({
      ok: false, service: "a7dev-cloudflare", ready: false,
      error: "migration_pending", database, storage
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
};

