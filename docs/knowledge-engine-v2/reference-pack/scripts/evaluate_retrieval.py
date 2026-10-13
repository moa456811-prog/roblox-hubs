#!/usr/bin/env python3
"""Run offline top-k retrieval quality checks. Measures retrieval, NOT working games."""
import argparse
import json
from pathlib import Path
from knowledge_engine import research,seed_database
ROOT=Path(__file__).resolve().parents[1]

def eval_cases(cases,db,k=5):
    rows=[]
    for case in cases:
        _,hits=research(case['request'],case['role'],db,k)
        found=[r['repo'] for r in hits]
        expected=set(case['expected_repos'])
        ok=bool(expected.intersection(found))
        rows.append({'request':case['request'],'pass':ok,'selected':found,
                     'expected_any':case['expected_repos']})
    good=sum(r['pass'] for r in rows)
    return {'passed':good,'total':len(rows),'hit_at_k':round(good/len(rows),4) if rows else None,
            'game_functionality_tested':False,'cases':rows}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--db',type=Path,default=ROOT/'knowledge_seed.sqlite')
    p.add_argument('--cases',type=Path,default=ROOT/'fixtures/retrieval_eval.json')
    p.add_argument('--k',type=int,default=5)
    p.add_argument('--output',type=Path)
    a=p.parse_args()
    seed_database(a.db)
    cases=json.loads(a.cases.read_text(encoding='utf-8'))
    report=eval_cases(cases,a.db,a.k)
    payload=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if a.output:a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(payload,encoding='utf-8')
    print(f'Retrieval hit@{a.k}: {report["passed"]}/{report["total"]} ({report["hit_at_k"]:.1%}), NOT game tests')
    for v in report['cases']:
        print(('PASS' if v['pass'] else 'FAIL')+'  '+v['request'])

if __name__=='__main__':main()
