import { legacyHandler } from './legacy.ts';
const CLOUDFLARE_ENDPOINT = Deno.env.get('A7DEV_CLOUDFLARE_ENDPOINT');
export async function routeRequest(req: Request, forceFallback = false) {
  if (req.method === 'POST' && !forceFallback) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const upstream = await fetch(CLOUDFLARE_ENDPOINT, {
        method:'POST',headers:{'content-type':'application/json'},
        body:await req.clone().text(),signal:controller.signal,redirect:'manual',
      });
      if (((upstream.status >= 200 && upstream.status < 300) || (upstream.status >= 400 && upstream.status < 500 && upstream.status !== 408))) {
        const data = await upstream.arrayBuffer();
        const headers = new Headers(upstream.headers);
        headers.set('x-a7dev-backend','cloudflare');
        return new Response(data,{status:upstream.status,headers});
      }
      await upstream.body?.cancel();
    } catch {
      // Network, timeout and server errors use the original backend.
    } finally { clearTimeout(timer); }
  }
  const response = await legacyHandler(req);
  const headers = new Headers(response.headers);
  headers.set('x-a7dev-backend','supabase-fallback');
  return new Response(response.body,{status:response.status,headers});
}
