import json, sqlite3, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'sources.json').read_text(encoding='utf-8'))
assert len(data['sources'])==60
assert len({x['id'] for x in data['sources']})==60
assert all(x['url']=='https://github.com/'+x['repo'] for x in data['sources'])
with sqlite3.connect(ROOT/'knowledge_seed.sqlite') as db:
 n=db.execute('SELECT COUNT(*) FROM sources').fetchone()[0]
 f=db.execute('SELECT COUNT(*) FROM documents').fetchone()[0]
 assert n==60 and f==60, (n,f)
 rs=db.execute("SELECT count(*) FROM documents_fts WHERE documents_fts MATCH 'network'").fetchone()[0]
 assert rs>0
cases=json.loads((ROOT/'docs/EVAL_CASES.json').read_text(encoding='utf-8'))
assert len(cases)>=10
print('PASS: 60 catalog entries, 60 metadata docs, FTS5 query, evaluation cases, unique IDs')
