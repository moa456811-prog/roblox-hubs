import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import backend from '../src/index.js';
import {verifyCloudflareSession} from '../src/session-verifier.js';
const pair = await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
const enc = b => Buffer.from(b).toString('base64url');
const env = {
 SESSION_ED25519_PRIVATE:enc(await crypto.subtle.exportKey('pkcs8',pair.privateKey)),
 SESSION_ED25519_PUBLIC:enc(await crypto.subtle.exportKey('raw',pair.publicKey)),
};
const originalFetch=globalThis.fetch;
let workinkCalls=0;
globalThis.fetch=async url=>{
 assert.equal(String(url),'https://work.ink/_api/v2/token/isValid/test-token?deleteToken=1');
 workinkCalls++;
 return Response.json({valid:true});
};
const response=await backend.fetch(new Request('https://test.invalid/v1/hub',{method:'POST',body:JSON.stringify({action:'authorize',key:'https://work.ink/test?token=test-token',user_id:12345})}),env);
const issued=await response.json();
assert.equal(response.status,200);assert.equal(issued.ok,true);assert.equal(workinkCalls,1);
assert.equal(issued.permanent,false);assert.equal(issued.admin,false);
assert(issued.session_seconds>=86390&&issued.session_seconds<=86400);
assert((await verifyCloudflareSession(issued.session,12345,env.SESSION_ED25519_PUBLIC)).uid===12345);
assert.equal(await verifyCloudflareSession(issued.session,12346,env.SESSION_ED25519_PUBLIC),null);
for (const payload of [{v:2,uid:12345,exp:0},{v:2,uid:12345},{v:2,uid:'12345',exp:9999999999}]) {
 const part=enc(JSON.stringify(payload));
 const sig=enc(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode('a7cf1.'+part)));
 assert.equal(await verifyCloudflareSession('a7cf1.'+part+'.'+sig,12345,env.SESSION_ED25519_PUBLIC),null);
}
globalThis.fetch=async()=>Response.json({valid:false});
assert.equal((await backend.fetch(new Request('https://test.invalid/v1/hub',{method:'POST',body:JSON.stringify({action:'authorize',key:'invalid',user_id:12345})}),env)).status,401);
globalThis.fetch=originalFetch;
console.log('Session signature, expiry, identity and Work.ink request/response contract passed (mock upstream).');
let router = await readFile(new URL('../supabase/router.example.ts',import.meta.url),'utf8');
router=router.replace("import { legacyHandler } from './legacy.ts';","const legacyHandler = async()=>new Response('fallback-body');").replace("Deno.env.get('A7DEV_CLOUDFLARE_ENDPOINT')","'https://test.invalid/v1/hub'").replace('req: Request','req');
const {routeRequest}=await import('data:text/javascript;base64,'+Buffer.from(router).toString('base64'));
const request=()=>new Request('https://test.invalid/legacy',{method:'POST',body:'{}'});
for (const status of [200,400,401,404,429]) {
 globalThis.fetch=async()=>new Response('primary',{status});
 const response=await routeRequest(request());
 assert.equal(response.status,status);assert.equal(response.headers.get('x-a7dev-backend'),'cloudflare');
}
for (const status of [302,408,500,503]) {
 globalThis.fetch=async()=>new Response('failed',{status});
 const response=await routeRequest(request());
 assert.equal(await response.text(),'fallback-body');
 assert.equal(response.headers.get('x-a7dev-backend'),'supabase-fallback');
}
globalThis.fetch=async()=>{throw new Error('network unavailable');};
assert.equal(await (await routeRequest(request())).text(),'fallback-body');
globalThis.fetch=originalFetch;
console.log('Automatic fallback on network/server failures; authentication denials and rate limits preserved.');
