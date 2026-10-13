#!/usr/bin/env python3
"""Nonexecuting static verification for an AI-generated Luau file.

A compiler success is not a Roblox live-game test or proof of server behavior.
If no compiler is installed, reports status unknown instead of 'pass'.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess

MAX_BYTES=3_000_000


def validate(path:Path,compiler=None):
    if not path.is_file():raise ValueError('Input source file not found')
    if path.stat().st_size>MAX_BYTES:raise ValueError('Source exceeds 3 MB validation limit')
    raw=path.read_text(encoding='utf-8',errors='replace')
    lines=raw.splitlines()
    warnings=[]
    for i,line in enumerate(lines,1):
        if re.search(r'\b(TODO|FIXME|NotImplemented|IMPLEMENT_ME|REPLACE_ME)\b|<REMOTE_[A-Z_]+>',line,re.I):
            warnings.append({'line':i,'kind':'unimplemented_marker','severity':'high',
                             'message':'Placeholder or explicit unfinished implementation'})
        if re.search(r'\b(?:FireServer|InvokeServer)\s*\(',line):
            warnings.append({'line':i,'kind':'game_specific_remote_call','severity':'info',
                             'message':'Remote call observed; server validation cannot be inferred from static source'})
    exe=compiler or shutil.which('luau-compile')
    compiled={'available':bool(exe),'status':'not_checked','exit_code':None,'stderr':''}
    if exe:
        try:
            p=subprocess.run([exe,str(path)],input=b'',capture_output=True,timeout=12)
            compiled={'available':True,'status':'passed' if p.returncode==0 else 'failed',
                      'exit_code':p.returncode,'stderr':p.stderr.decode('utf-8','replace')[:1200]}
        except (OSError,subprocess.TimeoutExpired) as e:
            compiled['status']='tool_error';compiled['stderr']=str(e)[:300]
    ready=compiled['status']=='passed' and not any(w['severity']=='high' for w in warnings)
    return {
      'source_path':str(path),'lines':len(lines),'compiler':compiled,
      'findings':warnings[:100],'static_gate':'pass' if ready else 'not_passed',
      'runtime_game_tested':False,'game_functionality_verified':False,
      'claim_100_percent_allowed':False,
      'explanation':'Luau compilation checks syntax only; it cannot validate remotes, combat, quests, private server checks or real-game behavior.'}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('script',type=Path)
    p.add_argument('--compiler',help='Path to a verified luau-compile binary')
    p.add_argument('--output',type=Path)
    a=p.parse_args()
    result=validate(a.script,a.compiler)
    data=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if a.output:a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(data,encoding='utf-8')
    print(data)
    if result['static_gate']!='pass':raise SystemExit(1)

if __name__=='__main__':main()
