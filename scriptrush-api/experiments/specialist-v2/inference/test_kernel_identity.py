"""Bounded Kaggle identity validation; no prepared run or API is touched."""
import unittest
from unittest.mock import patch

import prepare_production_dev_retry as dev


class KernelIdentityTests(unittest.TestCase):
    def test_all_future_dev_and_final_generated_identities_fit_and_match_titles(self):
        for suffix in ("bba41b91","12345678","ffffffff"):
            for phrase in ("prod dev","final recovered inference"):
                title="ScriptRush v2 "+phrase+" "+suffix
                slug=title.lower().replace(" ","-")
                self.assertLessEqual(len(slug),50)
                self.assertLessEqual(len(title),50)
                dev.validate_kernel_identity("sciptrush/"+slug,title)

    def test_fifty_character_boundary_passes_and_fifty_one_fails_closed(self):
        dev.validate_kernel_identity("sciptrush/"+"a"*50,"A"*50)
        for identifier,title in [("sciptrush/"+"a"*51,"A"*51),("sciptrush/"+"a"*50,"A"*51),("sciptrush/"+"a"*51,"A"*50)]:
            with self.assertRaisesRegex(ValueError,"INVALID_BOUNDED_KAGGLE_IDENTITY"):
                dev.validate_kernel_identity(identifier,title)

    def test_original_rejected_long_slug_mismatch_and_bad_owners_are_rejected(self):
        rejected="scriptrush-v2-production-dev-dataset-inference-bba41b91"
        self.assertGreater(len(rejected),50)
        for identifier,title in [("sciptrush/"+rejected,rejected.replace("-"," ")),("other/scriptrush-v2-prod-dev-bba41b91","ScriptRush v2 prod dev bba41b91"),("sciptrush/scriptrush-v2-prod-dev-bba41b91","Different title"),("sciptrush/bad_slug","bad slug"),("sciptrush/aaaa","aaaa")]:
            with self.assertRaises(ValueError):dev.validate_kernel_identity(identifier,title)


if __name__=="__main__":
    unittest.main()
