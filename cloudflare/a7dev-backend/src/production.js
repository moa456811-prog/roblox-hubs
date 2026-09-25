import backend from './index.js';
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/admin/test/')) return Response.json({ok:false,error:'not_found'},{status:404});
    try {
      if (path === '/health' && request.method === 'GET') {
        await env.DB.prepare('SELECT 1').first();
        await env.SCRIPTS.list({limit:1});
        return Response.json({ok:true,ready:true,service:'a7dev-cloudflare',database:'ok',storage:'ok'},{headers:{'cache-control':'no-store'}});
      }
      const response = await backend.fetch(request, env);
      const headers = new Headers(response.headers);
      headers.set('x-a7dev-backend','cloudflare');
      return new Response(response.body,{status:response.status,headers});
    } catch {
      return Response.json({ok:false,error:'backend_temporarily_unavailable'},{status:503,headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
    }
  }
};
