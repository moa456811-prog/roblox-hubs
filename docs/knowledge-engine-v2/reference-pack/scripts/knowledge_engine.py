#!/usr/bin/env python3
"""Offline plan and ranked retrieval; never pretends game mechanics are confirmed.

This is a working *research planner*, NOT a script generator, model API,
autonomous Roblox client, bypass, or game-testing service.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import sqlite3
import unicodedata
from typing import Any
from import_sources import SCHEMA,seed

ROOT=Path(__file__).resolve().parents[1]

TOPICS={
 'quests': {'terms':['quete','quest','questing','mission','farm','farming','autofarm'],
   'search':'NPC quest mission state machine objective pathfinding retry',
   'categories':['gameplay','architecture','data']},
 'boss': {'terms':['boss','raid','respawn','combat','hitbox','skill','kill','attaque','attack','instakill'],
   'search':'combat damage boss respawn projectile hitbox raycast',
   'categories':['gameplay','architecture','network']},
 'movement': {'terms':['move','speed','tp','teleport','physics','freeze','root','stun','dash','deplacement'],
   'search':'movement physics network owner pathfinding NPC component',
   'categories':['gameplay','network']},
 'network': {'terms':['remote','raknet','network','replicate','packet','serialization','reseau','sync','lag'],
   'search':'network replication remote serialization typed packet',
   'categories':['network','architecture']},
 'ui': {'terms':['ui','interface','bouton','toggle','mobile','hud','animation'],
   'search':'UI interface reactive layout animation signal',
   'categories':['ui']},
 'data': {'terms':['save','inventaire','inventory','persist','datastore','profile','sell','loot','item'],
   'search':'data save profile persistence inventory replication',
   'categories':['data','network']},
 'debug': {'terms':['error','bug','erreur','corrige','fix','nil','runtime','truncated','trunque'],
   'search':'luau static analysis test debug decompile luau parser',
   'categories':['tooling','analysis']},
 'files': {'terms':['rbxl','rbxlx','rbxm','rbxmx','parser','binary','xml','sourcefile','decompiler','decompile'],
   'search':'rbxl Roblox binary XML place parser file compiler',
   'categories':['tooling','analysis']},
 'testing': {'terms':['test','verify','verifier','fonctionne','fonctionnel','100%'],
   'search':'luau unit test static analysis compile testing',
   'categories':['tooling','data']},
}


def normalize(s):
    return ''.join(c for c in unicodedata.normalize('NFKD',s.lower()) if not unicodedata.combining(c))

def topics_for(message):
    n=normalize(message)
    return [k for k,v in TOPICS.items() if any(re.search(r'(?<!\w)'+re.escape(w)+r'(?!\w)',n) for w in v['terms'])]

def fts_query(s):
    tokens=list(dict.fromkeys(re.findall(r'[a-z][a-z0-9_]{2,}',normalize(s))))
    return ' OR '.join('"'+x+'"' for x in tokens[:30])

def repo_compatible(env,role):
    if role=='executor_client':
        return env in ('executor_analysis','project_client','project_both','reference_only','standalone_tool')
    if role=='game_project_client':
        return env in ('project_client','project_both','reference_only','standalone_tool')
    if role=='game_project_server':
        return env in ('project_server','project_both','reference_only','standalone_tool')
    return True

def research(message, role, dbpath,limit=8):
    topics=topics_for(message)
    terms=' '.join([message]+[TOPICS[t]['search'] for t in topics])
    query=fts_query(terms)
    if not query:query='"luau" OR "roblox"'
    matches=[]
    original_terms=[x for x in re.findall(r'[a-z0-9_]{3,}',normalize(message)) if x not in {'roblox','script','scripts','jeu','game','pour','avec','the','and','des','une','les','plus','dans','code','moi','mon'}]
    with sqlite3.connect(dbpath) as db:
        db.row_factory=sqlite3.Row
        rows=db.execute('''SELECT s.name,s.repo,s.environment,s.kind,s.category,s.priority,s.purpose,s.warning,
            s.license,s.import_status,d.path, bm25(documents_fts) AS bm
            FROM documents_fts JOIN documents d ON d.id=documents_fts.rowid
            JOIN sources s ON s.id=d.source_id
            WHERE documents_fts MATCH ? ORDER BY bm LIMIT 180''',(query,)).fetchall()
        seen=set()
        for row in rows:
            z=dict(row)
            if z['repo'] in seen:continue
            if not repo_compatible(z['environment'],role):continue
            seen.add(z['repo'])
            relevance=2 if z['category'] in [c for t in topics for c in TOPICS[t]['categories']] else 0
            text=normalize(' '.join(str(z.get(k) or '') for k in ('repo','name','purpose','warning')))
            exact=sum(1 for token in set(original_terms) if token in text)
            z['weight']=exact*7 + relevance*3 + (4-z['priority'])
            z['code_imported']=z['path']!='_catalog.txt'
            z['usable_in_script_without_server_access']= z['environment']=='project_client' and role in ('executor_client','game_project_client')
            # An open source module is not guaranteed compatible with an executor.
            z['compatibility_warning']=('A full game/framework library is not automatically callable from a client executor' if role=='executor_client' and z['environment']!='executor_analysis' else '')
            matches.append(z)
        # Query-specific word overlap + category + priority, BM25 only as a tie-breaker.
        # A source card is never proof of game compatibility.
        matches.sort(key=lambda z:(-z['weight'],z['bm']))
    return topics,matches[:max(1,min(limit,20))]

def find_recipes(topics, role, limit=6):
    catalog=json.loads((ROOT/'recipes.json').read_text(encoding='utf-8'))['recipes']
    selected=[]
    for r in catalog:
        env=r['environment']
        if r['topic'] not in topics:continue
        if role=='executor_client' and env in ('game_project_server','game_project_full'):continue
        if role=='game_project_client' and env=='game_project_server':continue
        if role=='game_project_server' and env=='project_client':continue
        selected.append(r)
    return selected[:limit]


def seed_database(dbpath):
    sources=json.loads((ROOT/'sources.json').read_text(encoding='utf-8'))['sources']
    with sqlite3.connect(dbpath) as db:
        db.executescript(SCHEMA)
        seed(db,sources)

def create_plan(request,role,profile,dbpath,limit=8):
    if not dbpath.exists():seed_database(dbpath)
    topics,matches=research(request,role,dbpath,limit)
    public=profile.get('game') if profile else None
    diagnostics=[
      'Public metadata and code libraries do not reveal private server-side APIs.',
      'A remotes name, damage rule or quest system must NOT be invented.',
      'A library example does not prove it works in this specific game.',
      'A generated script is NOT game-verified until a runtime test produces observable evidence.'
    ]
    if role=='executor_client':diagnostics.append('Do not assume server ownership or permissions unavailable to a client.')
    game_label=public.get('game_name') if public else None
    return {
      'engine_version':'2.0','timestamp_utc':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
      'game_file_required':False,'request':request,'role':role,
      'game_identity': {'name':game_label,'place_id':public.get('place_id') if public else None,
                        'source':profile.get('source_kind') if profile else 'not_discovered',
                        'mechanics_proven_by_identity':False},
      'topics':topics,'knowledge_references':matches,
      'engineering_recipes':find_recipes(topics,role),
      'evidence_levels':{'public_metadata':'game title/description only',
        'library_pattern':'generic reusable implementation, not game-specific',
        'runtime_observation':'when explicitly provided and attributable',
        'game_verified':'requires successful in-game test'},
      'mechanics_verified':[],
      'unknowns':['Game-specific remotes','Which mechanics are available client-side',
                  'Server-side validation rules','Game-specific expected success/failure signals'],
      'generation_policy':'Use validated public data and available sources. Never fabricate game APIs. If a mechanism is unknown, generate a parameterized adapter with clear TODOs or explain what cannot be proven; do not claim the script is fully functional.',
      'validation_required':['syntax_and_typecheck_if_available','smoke_test_or_mocks','in_game_feedback_for_real_functionality'],
      'can_claim_100_percent_functionality':False,
      'status':'GAME_RUNTIME_NOT_TESTED',
      'diagnostic_notes':diagnostics
    }

def main():
    p=argparse.ArgumentParser(description='Create source-grounded ScriptRush research plan (no RBXL required)')
    p.add_argument('--request',required=True)
    p.add_argument('--role',choices=['executor_client','game_project_client','game_project_server','game_project_full'],default='executor_client')
    p.add_argument('--profile',type=Path,help='Optional JSON generated by game_discovery.py')
    p.add_argument('--db',type=Path,default=ROOT/'knowledge_seed.sqlite')
    p.add_argument('--out',type=Path)
    p.add_argument('--limit',type=int,default=8)
    a=p.parse_args()
    if a.profile and not a.profile.exists():p.error('Game profile does not exist')
    profile=json.loads(a.profile.read_text(encoding='utf-8')) if a.profile else None
    plan=create_plan(a.request,a.role,profile,a.db,a.limit)
    serialized=json.dumps(plan,ensure_ascii=False,indent=2)+'\n'
    if a.out:a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(serialized,encoding='utf-8')
    print(serialized)

if __name__=='__main__':main()
