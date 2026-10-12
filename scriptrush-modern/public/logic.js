(()=>{
const S=window.SR,H=window.SR_H;
const getcode=v=>{const m=String(v||'').match(/\x60\x60\x60(?:lua|luau)?\s*([\s\S]*?)\x60\x60\x60/i);return m?m[1].trim():''};
const save=()=>{localStorage.sr_game=S.game;localStorage.sr_place=S.place};
function bind(){
document.querySelectorAll('[data-link]').forEach(x=>x.onclick=ev=>{ev.preventDefault();window.SR_goto(x.getAttribute('href'))});
for(const [id,key] of [['game','game'],['place','place'],['prompt','prompt'],['error','error'],['current','current']]){const x=document.getElementById(id);if(x)x.oninput=()=>{S[key]=x.value;if(key==='game'||key==='place')save();if(key==='current')localStorage.scriptrush_current_script=S.current}}
const f=document.getElementById('files');if(f)f.onchange=async()=>{S.files=await Promise.all([...f.files].slice(0,5).filter(x=>/\.(lua|luau|txt|json|log|md)$/i.test(x.name)).map(async x=>({name:x.name,size:x.size,content:(await x.text()).slice(0,70000)})));S.msg=S.files.length+' file(s) added';window.SR_render()};
document.querySelectorAll('[data-p]').forEach(x=>x.onclick=()=>{S.prompt=x.dataset.p;window.SR_render();document.getElementById('prompt')?.focus()});
document.querySelectorAll('[data-a]').forEach(x=>x.onclick=()=>act(x.dataset.a));
document.querySelectorAll('[data-open]').forEach(x=>x.onclick=()=>{let v=H()[+x.dataset.open];S.output=v.code;S.current=v.code;S.game=v.game;localStorage.scriptrush_current_script=v.code;save();window.SR_goto('/create')});
document.querySelectorAll('[data-copy]').forEach(x=>x.onclick=()=>copy(H()[+x.dataset.copy].code));
document.querySelectorAll('[data-delete]').forEach(x=>x.onclick=()=>{let h=H();h.splice(+x.dataset.delete,1);localStorage.sr_history=JSON.stringify(h);window.SR_render()})
}
async function copy(t){try{await navigator.clipboard.writeText(t)}catch{const x=document.createElement('textarea');x.value=t;document.body.appendChild(x);x.select();document.execCommand('copy');x.remove()}S.msg='Copied to clipboard';window.SR_render()}
async function research(){if(!S.game)return;try{const r=await fetch('/api/research-game?q='+encodeURIComponent(S.game));if(r.ok){const d=await r.json(),p=d.profile||d;if(p.placeId)S.place=String(p.placeId);save()}}catch{}}
function startTimer(){S.elapsed=0;S.timer=setInterval(()=>{S.elapsed++;const p=document.getElementById('status');if(p)p.textContent='Researching and generating · '+S.elapsed+'s'},1000)}
async function generate(fix){
if(S.busy)return;const prompt=(fix?S.error:S.prompt).trim();
if(!S.game.trim()||!prompt||(fix&&!S.current.trim())){S.msg='Enter a game, a request and the script to fix when needed.';window.SR_render();return}
S.busy=true;S.msg='';S.controller=new AbortController();window.SR_render();startTimer();
try{await research();const sources=[...S.files];if(S.profile)sources.unshift({name:'runtime-profile.json',content:S.profile.slice(0,76000),size:S.profile.length});
const res=await fetch('/api/guest-chat',{method:'POST',headers:{'content-type':'application/json'},signal:S.controller.signal,body:JSON.stringify({game:S.game,placeId:S.place,mode:fix?'fix':'build',prompt,sources:sources.slice(0,6),...(fix?{currentScript:S.current}:{})})});
const d=await res.json();if(!res.ok)throw Error(d.error||'Generation failed');const c=getcode(d.message);if(!c)throw Error('The model did not return a complete Lua script');
S.output=c;S.title=fix?'fixed-script.lua':'script.lua';S.current=c;localStorage.scriptrush_current_script=c;
const h=H();h.unshift({game:S.game,code:c,date:new Date().toLocaleDateString('en-GB')});try{localStorage.sr_history=JSON.stringify(h.slice(0,20))}catch{localStorage.sr_history=JSON.stringify(h.slice(0,5))}if(fix)S.error='';else S.prompt='';S.msg='Script ready. Test it in the game to confirm it works.'}
catch(err){S.msg=err.name==='AbortError'?'Generation stopped. Your previous script is safe.':err.message}finally{S.busy=false;clearInterval(S.timer);window.SR_render()}
}
async function scanner(){if(S.busy)return;S.busy=true;S.msg='';window.SR_render();try{const r=await fetch('/api/scanner');const d=await r.json();if(!r.ok||!d.script)throw Error('Scanner unavailable');S.output=d.script;S.title='live-scanner.lua';S.msg='Scanner ready. Copy it and run it in the game.'}catch(err){S.msg=err.message}finally{S.busy=false;window.SR_render()}}
function act(a){
if(a==='generate')generate(false);if(a==='fix')generate(true);if(a==='scanner')scanner();if(a==='copy')copy(S.output);
if(a==='full')document.getElementById('modal')?.classList.add('open');
if(a==='close')document.getElementById('modal')?.classList.remove('open');
if(a==='stop')S.controller?.abort();
if(a==='download'){const url=URL.createObjectURL(new Blob([S.output],{type:'text/plain'})),link=document.createElement('a');link.href=url;link.download=S.title;link.click();URL.revokeObjectURL(url)}
if(a==='import'){try{let raw=document.getElementById('report').value,mark='[SCRIPTRUSH_RUNTIME_PROFILE]';if(raw.includes(mark))raw=raw.slice(raw.lastIndexOf(mark)+mark.length).trim();const p=JSON.parse(raw);if(!p.game)throw Error();S.profile=JSON.stringify(p);localStorage.scriptrush_runtime_profile=S.profile;S.msg='Game profile imported'}catch{S.msg='Invalid scanner report'}window.SR_render()}
}
window.SR_bind=bind;document.addEventListener('keydown',ev=>{if(ev.key==='Escape')document.getElementById('modal')?.classList.remove('open')});bind();
})();