#!/usr/bin/env python3
"""Local no-network ranked lookup over ScriptRush FTS5 knowledge index."""
import argparse, re, sqlite3
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('query',nargs='+',help='Search text')
parser.add_argument('--db',type=Path,default=BASE/'knowledge_seed.sqlite')
parser.add_argument('--category',default=None)
parser.add_argument('--environment',default=None)
parser.add_argument('--limit',type=int,default=6)
args=parser.parse_args()
terms=re.findall(r'[\w-]{2,}', ' '.join(args.query).lower(),re.UNICODE)[:12]
if not terms:parser.error('Query must have a search token of at least 2 characters')
fts=' OR '.join('"'+w.replace('"','')+'"' for w in terms)
filters=[];params=[fts]
if args.category:filters.append('s.category=?');params.append(args.category)
if args.environment:filters.append('s.environment=?');params.append(args.environment)
params.append(min(max(1,args.limit),30))
where=' AND '+' AND '.join(filters) if filters else ''
with sqlite3.connect(args.db) as db:
 rows=db.execute('''SELECT s.name,s.repo,s.category,s.environment,s.license,
 d.path,substr(d.content,1,390),bm25(documents_fts) AS score
 FROM documents_fts JOIN documents d ON d.id=documents_fts.rowid
 JOIN sources s ON s.id=d.source_id
 WHERE documents_fts MATCH ?'''+where+''' ORDER BY score LIMIT ?''',params).fetchall()
 for name,repo,cat,env,license,path,snip,score in rows:
  print(f'[{cat}/{env}] {name} | {repo} | {path} | license={license or "unchecked"} | score={score:.2f}')
  print(' ', ' '.join(snip.split())[:390])
  print()
 if not rows:print('No matching documents indexed yet.')
