import unittest

from resources import INDIA_RESOURCES, crisis_resources


class ResourceTest(unittest.TestCase):
    def test_india_resources(self):
        resources, emergency = crisis_resources()
        self.assertEqual(emergency, "112")
        contacts = " ".join(item["contact"] for item in resources)
        self.assertIn("14416", contacts)
        self.assertIn("1800-599-0019", contacts)
        self.assertIn("98204 66726", contacts)

    def test_no_other_country_numbers(self):
        resources, _ = crisis_resources()
        contacts = " ".join(item["contact"] for item in resources)
        for number in ("988", "116 123", "13 11 14", "1737"):
            self.assertNotIn(number, contacts)

    def test_every_resource_has_name_and_contact(self):
        for item in INDIA_RESOURCES:
            self.assertTrue(item["name"])
            self.assertTrue(item["contact"])


if __name__ == "__main__":
    unittest.main()
