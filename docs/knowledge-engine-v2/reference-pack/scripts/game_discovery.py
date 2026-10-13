#!/usr/bin/env python3
"""Read *public* Roblox game metadata from a place URL/ID, no RBXL required.

Does NOT extract scripts, remotes, quest tables, combat logic, server internals,
or authenticate to the game. Static descriptions may be outdated or malicious;
store as untrusted evidence, never as instructions to the code-generating agent.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
MAX_BYTES=600_000
USER_AGENT='ScriptRushKnowledge/2.0 (Public game metadata research)'

class DiscoveryError(RuntimeError):pass

def place_id(value: str) -> str:
    s=str(value).strip()
    if re.fullmatch(r'[1-9][0-9]{0,18}',s): return s
    m=re.fullmatch(r'https?://(?:www\.|web\.)?roblox\.com/games/([1-9][0-9]{0,18})(?:[/?#].*)?',s,re.I)
    if m: return m.group(1)
    raise ValueError('Supply numeric Place ID or a Roblox game URL (https://www.roblox.com/games/123/name)')

def read_public_json(url: str, timeout=12):
    # Fixed, purpose-built URLs below. Never follow a user-supplied URL.
    if not (url.startswith('https://apis.roblox.com/universes/v1/places/')
            or url.startswith('https://games.roblox.com/v1/games?universeIds=')):
        raise DiscoveryError('External URL not allowlisted')
    req=urllib.request.Request(url,headers={'User-Agent':USER_AGENT,'Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=timeout) as res:
        if res.status!=200:raise DiscoveryError(f'HTTP {res.status}')
        b=res.read(MAX_BYTES+1)
    if len(b)>MAX_BYTES:raise DiscoveryError('Game metadata response too large')
    return json.loads(b.decode('utf-8'))

def fetch_public_game(place, fetch_json=read_public_json):
    pid=place_id(place)
    u=fetch_json(f'https://apis.roblox.com/universes/v1/places/{pid}/universe')
    uid=u.get('universeId')
    if not isinstance(uid,int) or uid<=0:raise DiscoveryError('Could not resolve Universe ID from public endpoint')
    g=fetch_json(f'https://games.roblox.com/v1/games?universeIds={uid}')
    items=g.get('data') if isinstance(g,dict) else None
    item=next((it for it in items or [] if str(it.get('id'))==str(uid)),None)
    if not item:raise DiscoveryError('No public game details returned for this universe')
    return build_profile(pid,uid,item)

def build_profile(pid,uid,item):
    # Strict whitelist. Never transfer arbitrary network fields to a prompt.
    summary={
        'place_id':str(pid),'universe_id':int(uid),
        'game_name':str(item.get('name') or '')[:180],
        'description':str(item.get('description') or '')[:2500],
        'root_place_id':str(item.get('rootPlaceId') or ''),
        'creator_name':str((item.get('creator') or {}).get('name') or '')[:120],
        'game_page':f'https://www.roblox.com/games/{pid}',
        'game_updated_at':str(item.get('updated') or '')[:60],
    }
    return {
      'schema_version':'2.0','source_kind':'public_game_metadata',
      'retrieved_at':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
      'game':summary,
      'mechanics':[],
      'limits':['Public game metadata cannot prove internal game mechanics.',
                'Names of remotes, damage logic, quests, and server scripts are NOT discoverable from metadata.',
                'Do not infer game support from the description alone.'],
    }

def main():
    a=argparse.ArgumentParser(description='Read Roblox public game metadata, no RBXL upload required')
    a.add_argument('place',help='Roblox game URL or Place ID')
    a.add_argument('--fixture',type=Path,help='Offline test fixture with universe + game data (not real game evidence)')
    a.add_argument('--save',type=Path,help='Write JSON profile. Defaults to profiles/<place-id>.json')
    args=a.parse_args()
    pid=place_id(args.place)
    if args.fixture:
        f=json.loads(args.fixture.read_text(encoding='utf-8'))
        def mock(url):
            return f['universe'] if '/universe' in url and 'universeIds' not in url else f['games']
        result=fetch_public_game(pid,mock)
        result['source_kind']='offline_fixture_not_verified'
    else:
        try:result=fetch_public_game(pid)
        except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError,DiscoveryError) as e:
            a.exit(2,f'Discovery unavailable: {e}\nNo mechanism inferred. Supply optional observed data, not a game file.\n')
    output=args.save or ROOT/'profiles'/f'{pid}.json'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'saved':str(output),'game_name':result['game']['game_name'],
       'place_id':pid,'evidence':result['source_kind'],'game_mechanics_verified':0},ensure_ascii=False))

if __name__=='__main__':main()
