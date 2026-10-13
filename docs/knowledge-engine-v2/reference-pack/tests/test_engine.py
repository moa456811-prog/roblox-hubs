import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from game_discovery import place_id,build_profile,fetch_public_game
from knowledge_engine import create_plan,seed_database,research,topics_for,repo_compatible
from check_generated import validate

class TestScriptRush(unittest.TestCase):
  @classmethod
  def setUpClass(cls):
    cls.tmp=tempfile.TemporaryDirectory()
    cls.db=Path(cls.tmp.name)/'seed.db'
    seed_database(cls.db)

  @classmethod
  def tearDownClass(cls):cls.tmp.cleanup()

  def test_no_game_file_required(self):
    plan=create_plan('Auto Farm quests', 'executor_client',None,self.db)
    self.assertEqual(plan['game_file_required'],False)
    self.assertFalse(plan['can_claim_100_percent_functionality'])
    self.assertEqual(plan['status'],'GAME_RUNTIME_NOT_TESTED')

  def test_catalogue_78_cards(self):
    with sqlite3.connect(self.db) as db:
      count=db.execute('SELECT COUNT(*) FROM sources').fetchone()[0]
    self.assertEqual(count,78)

  def test_place_id_validation_and_ssrf(self):
    self.assertEqual(place_id('https://www.roblox.com/games/123456/example'),'123456')
    with self.assertRaises(ValueError):place_id('https://evil.example.com/games/1234')
    with self.assertRaises(ValueError):place_id('https://www.roblox.com/games/0/a')

  def test_public_metadata_does_not_claim_mechanics(self):
    fixture=json.loads((ROOT/'fixtures/public_game_mock.json').read_text())
    def fake(url):
      return fixture['universe'] if '/universe' in url and 'universeIds' not in url else fixture['games']
    item=fetch_public_game('123456',fake)
    self.assertEqual(item['game']['game_name'],'Fictional Quest Demo (fixture)')
    self.assertEqual(item['mechanics'],[])
    plan=create_plan('farm boss', 'executor_client',item,self.db)
    self.assertEqual(plan['mechanics_verified'],[])

  def test_french_recognition(self):
    names=topics_for('Corrige auto farm et quête qui bloque le boss')
    self.assertIn('quests',names);self.assertIn('boss',names)

  def test_dont_use_server_lib_as_client(self):
    self.assertFalse(repo_compatible('project_server','executor_client'))
    self.assertTrue(repo_compatible('executor_analysis','executor_client'))

  def test_search_gameplay(self):
    topics,results=research('NPC pathfinding quest', 'game_project_server',self.db)
    self.assertTrue(results)
    self.assertTrue(any(r['category']=='gameplay' for r in results))

  def test_static_check_no_false_100_percent(self):
    src=Path(self.tmp.name)/'one.luau';src.write_text('local x = 1\nreturn x\n')
    result=validate(src,compiler=None)
    self.assertFalse(result['game_functionality_verified'])
    self.assertFalse(result['claim_100_percent_allowed'])
    self.assertIn(result['compiler']['status'],('not_checked','passed'))

  def test_unimplemented_detection(self):
    src=Path(self.tmp.name)/'todo.luau';src.write_text('-- TODO: game-specific remote unknown\n')
    result=validate(src,compiler=None)
    self.assertTrue(any(f['kind']=='unimplemented_marker' for f in result['findings']))
    self.assertEqual(result['static_gate'],'not_passed')

if __name__=='__main__':unittest.main(verbosity=2)

# Extra offline tests without depending on public API/network availability.
class TestPublicExamples(unittest.TestCase):
  def test_candidates_not_automatically_trusted(self):
    from public_game_examples import candidates_for_profile
    fixture=json.loads((ROOT/'fixtures/public_game_mock.json').read_text())
    profile=build_profile('123456',987654,fixture['games']['data'][0])
    def fake(url):
      self.assertTrue(url.startswith('https://api.github.com/search/repositories?'))
      return {'items':[{'full_name':'example/game-demo','description':'untrusted','license':{'spdx_id':'MIT'}}]}
    d=candidates_for_profile(profile,fake)
    self.assertEqual(d['candidates'][0]['match_status'],'CANDIDATE_ONLY_NOT_VERIFIED')
    self.assertEqual(len(d['candidates']),1)

