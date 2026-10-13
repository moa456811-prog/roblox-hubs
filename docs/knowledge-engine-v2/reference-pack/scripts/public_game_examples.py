#!/usr/bin/env python3
"""Optional public GitHub repository discovery from a Roblox game profile.

Returns ONLY possible matches. The code is not downloaded/executed or trusted.
No private game files required. GitHub search cannot prove the scripts work.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parents[1]

def fetch_json(url):
    if not url.startswith('https://api.github.com/search/repositories?'):
        raise ValueError('Unexpected URL origin')
    hdr={'User-Agent':'ScriptRushKnowledge/2.0','Accept':'application/vnd.github+json'}
    token=os.getenv('GITHUB_TOKEN')
    if token:hdr['Authorization']='Bearer '+token
    with urllib.request.urlopen(urllib.request.Request(url,headers=hdr),timeout=15) as f:
        raw=f.read(500_001)
    if len(raw)>500_000:raise ValueError('Too large search result')
    return json.loads(raw)

def candidates_for_profile(profile, fetch=fetch_json, max_results=8):
    game=(profile.get('game') or {})
    name=str(game.get('game_name') or '').strip()
    if not name:raise ValueError('Public profile missing game title')
    # Remove markup/operators. Only metadata, never source code or generated instructions.
    title=re.sub(r'[^\w \-]',' ',name,flags=re.UNICODE)
    title=' '.join(title.split())[:70]
    place=str(game.get('place_id') or '')
    q=f'"{title}" Roblox in:name,description'
    params=urllib.parse.urlencode({'q':q,'sort':'best-match','per_page':min(max_results,20)})
    data=fetch('https://api.github.com/search/repositories?'+params)
    results=[]
    for item in data.get('items',[]):
        repo=str(item.get('full_name') or '')
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',repo):continue
        results.append({
          'repo':repo,'url':f'https://github.com/{repo}',
          'description':str(item.get('description') or '')[:350],
          'is_archived':bool(item.get('archived')),
          'license_hint':str((item.get('license') or {}).get('spdx_id') or 'unknown'),
          'match_status':'CANDIDATE_ONLY_NOT_VERIFIED',
          'importance':'Review manually; a matching repository name alone does not show game compatibility.'
        })
    return {'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
      'game_name':name,'place_id':place,'source':'GitHub public repository search',
      'query':q,'candidates':results,
      'warning':'Candidate repositories are NOT working-script evidence. Scan permissions, license, trustworthiness, code quality and actual game version before referencing them.'}

def main():
    p=argparse.ArgumentParser(description='Find public repo candidates for a Roblox game without its file')
    p.add_argument('--profile',required=True,type=Path)
    p.add_argument('--save',type=Path)
    a=p.parse_args()
    profile=json.loads(a.profile.read_text(encoding='utf-8'))
    try:result=candidates_for_profile(profile)
    except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError) as ex:
        p.exit(2,'GitHub search unavailable: '+str(ex)+'\n')
    serialized=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if a.save:a.save.parent.mkdir(parents=True,exist_ok=True);a.save.write_text(serialized,encoding='utf-8')
    print(serialized)

if __name__=='__main__':main()
