const BRIDGE_HASH="REPLACE_WITH_SHA256_OF_PRIVATE_BRIDGE_TOKEN";
const ADMIN_SHA256="REPLACE_WITH_EXISTING_ADMIN_KEY_HASH";
function decode(s:string){const t=atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4));return Uint8Array.from(t,c=>c.charCodeAt(0));}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const bearer=(req.headers.get("authorization")||"").replace(/^Bearer /,"");
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer)))).map(x=>x.toString(16).padStart(2,"0")).join("");
 if(digest!==BRIDGE_HASH)return Response.json({ok:false},{status:403});
 try{
 const body=await req.json();const uid=Number(body.user_id);const parts=String(body.session||"").split(".");
 if(!Number.isSafeInteger(uid)||uid<=0||parts.length!==3||parts[0]!=="a7v2"||String(body.session).length>4096)throw new Error();
 const secret=Deno.env.get("A7DEV_SESSION_SECRET")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||ADMIN_SHA256;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 if(!await crypto.subtle.verify("HMAC",key,decode(parts[2]),new TextEncoder().encode(parts[1])))throw new Error();
 const payload=JSON.parse(new TextDecoder().decode(decode(parts[1])));
 if(payload.v!==2||payload.uid!==uid||!Number.isFinite(payload.exp)||payload.exp<=Math.floor(Date.now()/1000))throw new Error();
 return Response.json({ok:true,payload},{headers:{"cache-control":"no-store"}});
 }catch{return Response.json({ok:false},{status:401,headers:{"cache-control":"no-store"}});}
});