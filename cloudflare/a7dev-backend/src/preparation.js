import backend from "./index.js";
export default {
 async fetch(request, env) {
  const url=new URL(request.url);
  if(url.pathname.startsWith("/admin/")) {
   const a=new TextEncoder().encode(request.headers.get("authorization")||"");
   const b=new TextEncoder().encode("Bearer "+env.ADMIN_API_TOKEN);
   if(!env.ADMIN_API_TOKEN||a.length!==b.length||!crypto.subtle.timingSafeEqual(a,b))return Response.json({ok:false,error:"forbidden"},{status:403});
   if(url.pathname==="/admin/test/hub" && request.method==="POST"){
    return backend.fetch(new Request(url.origin+"/v1/hub",{method:"POST",headers:{"content-type":"application/json"},body:await request.text()}),env);
   }
   return backend.fetch(request,env);
  }
  let database="unchecked",storage="unchecked";
  if(request.method==="GET"&&url.pathname==="/health"){
   try{await env.DB.prepare("SELECT 1").first();database="ok";}catch{database="error";}
   try{await env.SCRIPTS.list({limit:1});storage="ok";}catch{storage="error";}
  }
  return Response.json({ok:false,ready:false,error:"migration_pending",database,storage},{status:503,headers:{"cache-control":"no-store"}});
 }
};