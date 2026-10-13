#!/usr/bin/env python3
"""ScriptRush offline knowledge importer (standard library only).

Source is treated as untrusted text and is NEVER executed. Metadata-only
seeding is the default; --fetch imports excerpts from verified permissive
public GitHub repositories. Designed as a starter to adapt for production.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import zipfile

BASE = Path(__file__).resolve().parents[1]
CATALOG = BASE / 'sources.json'
DEFAULT_DB = BASE / 'knowledge_seed.sqlite'
PERMISSIVE_LICENSES = {'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0'}
EXTENSIONS = ('.lua', '.luau', '.md')
USER_AGENT = 'ScriptRushKnowledgePack/1.0 (catalog and license-aware code indexing)'

SCHEMA = '''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY, repo TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 category TEXT NOT NULL, environment TEXT NOT NULL, kind TEXT NOT NULL,
 priority INTEGER NOT NULL, purpose TEXT NOT NULL, warning TEXT NOT NULL,
 license TEXT, archived INTEGER, pushed_at TEXT, checked_at TEXT,
 import_status TEXT NOT NULL DEFAULT 'catalog_only', error TEXT
);
CREATE TABLE IF NOT EXISTS documents (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
 path TEXT NOT NULL, chunk INTEGER NOT NULL, content TEXT NOT NULL,
 hash TEXT NOT NULL, indexed_at TEXT NOT NULL,
 UNIQUE (source_id,path,chunk)
);
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
 content,path,content='documents',content_rowid='id',tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
 INSERT INTO documents_fts(rowid,content,path) VALUES(new.id,new.content,new.path);
END;
CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
 INSERT INTO documents_fts(documents_fts,rowid,content,path)
 VALUES('delete',old.id,old.content,old.path);
END;
CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
 INSERT INTO documents_fts(documents_fts,rowid,content,path)
 VALUES('delete',old.id,old.content,old.path);
 INSERT INTO documents_fts(rowid,content,path) VALUES(new.id,new.content,new.path);
END;
'''


def now():
 return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def get_bytes(url, max_bytes, api=False):
 headers = {'User-Agent':USER_AGENT,'Accept':'application/vnd.github+json' if api else 'application/octet-stream'}
 token = os.getenv('GITHUB_TOKEN')
 # Only send bearer credentials to GitHub's API origin; never send them to the archive CDN.
 if token and url.startswith('https://api.github.com/'):
  headers['Authorization'] = 'Bearer '+token
 req=urllib.request.Request(url,headers=headers)
 with urllib.request.urlopen(req, timeout=25) as resp:
  data=resp.read(max_bytes+1)
 if len(data)>max_bytes:
  raise RuntimeError(f'Download exceeds configured limit ({max_bytes} bytes)')
 return data


def github_repo_info(repo):
 url='https://api.github.com/repos/'+repo
 info=json.loads(get_bytes(url,2_000_000,api=True))
 lic=(info.get('license') or {}).get('spdx_id') or 'UNKNOWN'
 return {'license':lic,'archived':bool(info.get('archived')),
         'default_branch': info.get('default_branch') or 'main',
         'pushed_at':info.get('pushed_at'),'size_kb':info.get('size') or 0}


def upsert_document(db,source_id,path,chunk,content):
 digest=hashlib.sha256(content.encode('utf-8')).hexdigest()
 db.execute('''INSERT INTO documents(source_id,path,chunk,content,hash,indexed_at)
 VALUES(?,?,?,?,?,?) ON CONFLICT(source_id,path,chunk) DO UPDATE SET
 content=excluded.content,hash=excluded.hash,indexed_at=excluded.indexed_at''',
 (source_id,path,chunk,content,digest,now()))


def seed(db, sources):
 for s in sources:
  db.execute('''INSERT INTO sources(id,repo,name,category,environment,kind,priority,purpose,warning)
 VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
 name=excluded.name,category=excluded.category,environment=excluded.environment,
 kind=excluded.kind,priority=excluded.priority,purpose=excluded.purpose,warning=excluded.warning''',
 (s['id'],s['repo'],s['name'],s['category'],s['environment'],s['kind'],s['priority'],s['purpose'],s['warning']))
  upsert_document(db,s['id'],'_catalog.txt',0,
      f"{s['name']} — {s['purpose']}. Category: {s['category']}. Environment: {s['environment']}. "
      f"Github: {s['url']}. Note: {s['warning']}")
 db.commit()


def relevant(name):
 name=name.lower()
 if name.endswith('.md'):
  return ('readme' in name or '/docs/' in name or '/examples/' in name or '/how_to/' in name)
 return name.endswith(('.lua','.luau'))


def path_priority(name):
 t=name.lower()
 return (0 if ('/examples/' in t or '/tests/' in t or '/test/' in t or '/how_to/' in t)
         else 1 if ('/src/' in t or '/modules/' in t or '/lib/' in t) else 2),len(t)


def extract_archive(db, s, archive, max_files=80, max_chunks=600):
 # Zip members are read in memory. Never extract any paths or execute downloaded code.
 z=zipfile.ZipFile(io.BytesIO(archive))
 members=[m for m in z.infolist() if not m.is_dir() and relevant(m.filename)
          and m.file_size <= 160_000 and m.compress_size <= 160_000]
 members.sort(key=lambda m:path_priority(m.filename))
 db.execute("DELETE FROM documents WHERE source_id=? AND path!='_catalog.txt'",(s['id'],))
 count=0
 for m in members[:max_files]:
  raw=z.read(m)
  if b'\x00' in raw: continue
  content=raw.decode('utf-8',errors='replace')
  parts=m.filename.split('/',1)
  path=parts[1] if len(parts)==2 else m.filename
  lines=content.splitlines()
  if not lines: continue
  chunk=0
  # Per-file bound protects search quality; chunks overlap slightly.
  for i in range(0,min(len(lines),1250),100):
   excerpt='\n'.join(lines[i:min(i+120,len(lines))])
   upsert_document(db,s['id'],path,chunk,excerpt)
   count+=1; chunk+=1
   if count>=max_chunks: break
  if count>=max_chunks: break
 db.commit()
 return count


def fetch_one(db,s,max_download):
 row=github_repo_info(s['repo'])
 status='metadata_only'
 if s['environment']=='reference_only':
  status='reference_only'
 elif row['archived']:
  status='archived_metadata_only'
 elif row['license'] not in PERMISSIVE_LICENSES:
  status='license_review_required'
 else:
  url='https://codeload.github.com/'+s['repo']+'/zip/refs/heads/'+row['default_branch']
  data=get_bytes(url,max_download,api=False)
  n=extract_archive(db,s,data)
  status=f'indexed_{n}_chunks'
 db.execute('''UPDATE sources SET license=?,archived=?,pushed_at=?,checked_at=?,
 import_status=?,error=NULL WHERE id=?''',
 (row['license'],int(row['archived']),row['pushed_at'],now(),status,s['id']))
 db.commit()
 return status


def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--db',type=Path,default=DEFAULT_DB)
 p.add_argument('--fetch',action='store_true',help='Fetch live repo metadata and permitted source archives')
 p.add_argument('--max-repos',type=int,default=10,help='Max repos to fetch; default 10 for GitHub API limits')
 p.add_argument('--max-download-mb',type=int,default=16)
 p.add_argument('--pause',type=float,default=0.6)
 args=p.parse_args()
 catalog=json.loads(CATALOG.read_text(encoding='utf-8'))
 args.db.parent.mkdir(parents=True,exist_ok=True)
 with sqlite3.connect(args.db) as db:
  db.executescript(SCHEMA)
  seed(db,catalog['sources'])
  print('Seeded',len(catalog['sources']),'repository cards into',args.db)
  if not args.fetch:
   print('METADATA ONLY. To fetch permitted sources, run with --fetch. Nothing was downloaded.')
   return
  ordered=sorted(catalog['sources'],key=lambda v:(v['priority'],v['name'].lower()))
  for ix,s in enumerate(ordered[:max(0,args.max_repos)],start=1):
   try:
    status=fetch_one(db,s,max(1,args.max_download_mb)*1024*1024)
    print(f'[{ix}] {s["repo"]}: {status}')
   except (urllib.error.HTTPError,urllib.error.URLError,RuntimeError,ValueError,zipfile.BadZipFile,OSError) as exc:
    err=str(exc)[:350]
    db.execute('UPDATE sources SET import_status=?,error=?,checked_at=? WHERE id=?',
               ('fetch_error',err,now(),s['id']))
    db.commit()
    print(f'[{ix}] {s["repo"]}: ERROR {err}',file=sys.stderr)
   if args.pause and ix<min(len(ordered),args.max_repos):time.sleep(args.pause)

if __name__=='__main__':main()
