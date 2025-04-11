import json
import os
import unittest

import safety

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class EvalSetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(BASE_DIR, "eval_phrases.json")) as handle:
            cls.phrases = json.load(handle)

    def test_explicit_phrases_are_detected(self):
        for item in self.phrases:
            if item["explicit"]:
                with self.subTest(text=item["text"]):
                    self.assertTrue(safety.find_crisis_phrases(item["text"]))

    def test_non_explicit_phrases_are_ignored(self):
        for item in self.phrases:
            if not item["explicit"]:
                with self.subTest(text=item["text"]):
                    self.assertEqual(safety.find_crisis_phrases(item["text"]), [])

    def test_third_party_phrases_are_not_about_the_user(self):
        for item in self.phrases:
            if item["category"] == "third_party":
                with self.subTest(text=item["text"]):
                    matches = safety.find_crisis_phrases(item["text"])
                    self.assertTrue(matches)
                    self.assertTrue(all(not match.about_self for match in matches))

    def test_historical_phrases_are_marked(self):
        for item in self.phrases:
            if item["category"] == "historical":
                with self.subTest(text=item["text"]):
                    matches = safety.find_crisis_phrases(item["text"])
                    self.assertTrue(matches)
                    self.assertTrue(all(match.historical for match in matches))
                    self.assertTrue(all(not match.urgent for match in matches))


class FramingTest(unittest.TestCase):
    def test_negation_in_earlier_clause_does_not_cancel(self):
        matches = safety.find_crisis_phrases("i am not happy and i want to die")
        self.assertTrue(matches)
        self.assertTrue(matches[0].about_self)

    def test_third_party_then_self(self):
        matches = safety.find_crisis_phrases("my friend is depressed and i want to die")
        self.assertTrue(matches)
        self.assertTrue(matches[0].about_self)

    def test_self_then_third_party(self):
        matches = safety.find_crisis_phrases("i think my friend wants to kill himself")
        self.assertTrue(matches)
        self.assertFalse(matches[0].about_self)

    def test_reported_speech_about_self(self):
        matches = safety.find_crisis_phrases("he told me i should kill myself")
        self.assertTrue(matches)
        self.assertTrue(matches[0].about_self)

    def test_negation_after_match_does_not_cancel(self):
        matches = safety.find_crisis_phrases("i want to kill myself but not today")
        self.assertTrue(matches)

    def test_protective_statement(self):
        self.assertEqual(
            safety.find_crisis_phrases("i dont want to die, i want the pain to stop"), []
        )
        self.assertTrue(safety.find_crisis_phrases("i dont want to live"))

    def test_negation_with_punctuation(self):
        self.assertEqual(safety.find_crisis_phrases("i am not suicidal, just tired"), [])
        self.assertTrue(safety.find_crisis_phrases("i am not suicidal and i want to die"))

    def test_method_mentions(self):
        for text in (
            "i took a whole bottle of pills",
            "i took 500mg of paracetamol",
            "i slit my wrists",
            "i cut my wrists",
            "how long until i bleed out",
            "i want to jump off a bridge",
            "i jumped from a hundred story height",
            "i want to shoot myself",
        ):
            with self.subTest(text=text):
                self.assertTrue(safety.find_crisis_phrases(text))

    def test_prescribed_dose_is_not_a_method(self):
        self.assertEqual(safety.find_crisis_phrases("i am taking 500mg of paracetamol daily"), [])

    def test_rhetorical_question_is_not_negation(self):
        matches = safety.find_crisis_phrases("wouldn't it be easier if i jumped off a bridge")
        self.assertTrue(matches)
        self.assertEqual(safety.find_crisis_phrases("i wouldn't kill myself"), [])

    def test_pull_the_trigger(self):
        self.assertTrue(safety.find_crisis_phrases("i feel like i could pull the trigger today"))

    def test_third_person_helper(self):
        self.assertTrue(safety.looks_third_person("she was so depressed, it was awful"))
        self.assertTrue(safety.looks_third_person("my friend is going through a lot"))
        self.assertFalse(safety.looks_third_person("i am so tired of everything"))
        self.assertFalse(safety.looks_third_person("my dog was killed last week and i am devastated"))


if __name__ == "__main__":
    unittest.main()
