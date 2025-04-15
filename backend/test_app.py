from datetime import date, timedelta
import os
import tempfile
import unittest

os.environ['APP_DB_PATH'] = os.path.join(tempfile.mkdtemp(), 'test.db')

import main1


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.client = main1.app.test_client()
        self.username = f"user{id(self)}"

    def signup(self, username):
        response = self.client.post(
            '/auth/signup', json={'username': username, 'password': 'secret123'}
        )
        self.assertEqual(response.status_code, 201)
        return {'Authorization': f"Bearer {response.get_json()['token']}"}

    def test_resources_are_public(self):
        response = self.client.get('/resources')
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body['emergency'], '112')
        contacts = ' '.join(item['contact'] for item in body['resources'])
        self.assertIn('14416', contacts)

    def test_signup_login_and_duplicate(self):
        headers = self.signup('alice')
        me = self.client.get('/auth/me', headers=headers)
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.get_json()['username'], 'alice')

        duplicate = self.client.post(
            '/auth/signup', json={'username': 'alice', 'password': 'secret123'}
        )
        self.assertEqual(duplicate.status_code, 409)

        wrong = self.client.post(
            '/auth/login', json={'username': 'alice', 'password': 'wrong'}
        )
        self.assertEqual(wrong.status_code, 401)

        login = self.client.post(
            '/auth/login', json={'username': 'alice', 'password': 'secret123'}
        )
        self.assertEqual(login.status_code, 200)
        self.assertIn('token', login.get_json())

    def test_protected_routes_need_a_token(self):
        self.assertEqual(self.client.get('/messages').status_code, 401)
        self.assertEqual(self.client.get('/confessions').status_code, 401)
        self.assertEqual(self.client.delete('/confessions/1').status_code, 401)
        self.assertEqual(self.client.get('/checkins').status_code, 401)
        self.assertEqual(self.client.get('/account/export').status_code, 401)
        self.assertEqual(self.client.delete('/account').status_code, 401)
        self.assertEqual(
            self.client.post('/predict_text', json={'text': 'hello'}).status_code, 401
        )

    def test_messages_are_per_user(self):
        alice = self.signup('alice2')
        bob = self.signup('bob2')

        created = self.client.post(
            '/messages', json={'content': 'alice only'}, headers=alice
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.get_json()['content'], 'alice only')

        alice_messages = self.client.get('/messages', headers=alice).get_json()
        self.assertEqual(len(alice_messages), 1)
        self.assertEqual(alice_messages[0]['content'], 'alice only')

        self.assertEqual(self.client.get('/messages', headers=bob).get_json(), [])

    def test_confessions_are_private(self):
        alice = self.signup('alice3')
        bob = self.signup('bob3')

        alice_confession = self.client.post(
            '/confessions', json={'content': 'alice secret'}, headers=alice
        ).get_json()
        bob_confession = self.client.post(
            '/confessions', json={'content': 'bob secret'}, headers=bob
        ).get_json()

        alice_list = self.client.get('/confessions', headers=alice).get_json()
        self.assertEqual([item['content'] for item in alice_list], ['alice secret'])
        bob_list = self.client.get('/confessions', headers=bob).get_json()
        self.assertEqual([item['content'] for item in bob_list], ['bob secret'])

        cannot_delete = self.client.delete(
            f"/confessions/{alice_confession['id']}", headers=bob
        )
        self.assertEqual(cannot_delete.status_code, 404)

        deleted = self.client.delete(
            f"/confessions/{alice_confession['id']}", headers=alice
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get('/confessions', headers=alice).get_json(), [])
        self.assertEqual(
            self.client.delete(
                f"/confessions/{bob_confession['id']}", headers=bob
            ).status_code,
            200,
        )

    def test_confession(self):
        headers = self.signup('carol')

        confession = self.client.post(
            '/confessions', json={'content': 'a secret'}, headers=headers
        )
        self.assertEqual(confession.status_code, 201)
        self.assertEqual(confession.get_json()['content'], 'a secret')

    def test_checkins_and_streak(self):
        headers = self.signup('heidi')
        today = date.today()
        today_str = today.isoformat()
        yesterday_str = (today - timedelta(days=1)).isoformat()

        empty = self.client.get(
            f'/checkins?today={today_str}', headers=headers
        ).get_json()
        self.assertEqual(empty, {'streak': 0, 'checkins': []})

        first = self.client.post(
            '/checkins',
            json={'local_date': yesterday_str, 'activity': 'take a walk'},
            headers=headers,
        )
        self.assertEqual(first.status_code, 201)
        second = self.client.post(
            '/checkins',
            json={'local_date': today_str, 'activity': 'breathe'},
            headers=headers,
        )
        self.assertEqual(second.status_code, 201)

        duplicate = self.client.post(
            '/checkins',
            json={'local_date': today_str, 'activity': 'something else'},
            headers=headers,
        )
        self.assertEqual(duplicate.status_code, 200)

        body = self.client.get(
            f'/checkins?today={today_str}', headers=headers
        ).get_json()
        self.assertEqual(body['streak'], 2)
        self.assertEqual(
            [item['activity'] for item in body['checkins']],
            ['breathe', 'take a walk'],
        )

        bad_date = self.client.post(
            '/checkins',
            json={'local_date': 'not-a-date', 'activity': 'walk'},
            headers=headers,
        )
        self.assertEqual(bad_date.status_code, 400)

        too_far = (today + timedelta(days=2)).isoformat()
        future = self.client.post(
            '/checkins',
            json={'local_date': too_far, 'activity': 'walk'},
            headers=headers,
        )
        self.assertEqual(future.status_code, 400)

    def test_account_export_and_delete(self):
        headers = self.signup('ivan')
        self.client.post('/confessions', json={'content': 'secret'}, headers=headers)
        self.client.post('/messages', json={'content': 'hello'}, headers=headers)
        today = date.today().isoformat()
        self.client.post(
            '/checkins',
            json={'local_date': today, 'activity': 'walk'},
            headers=headers,
        )

        exported = self.client.get('/account/export', headers=headers)
        self.assertEqual(exported.status_code, 200)
        body = exported.get_json()
        self.assertEqual(body['user']['username'], 'ivan')
        self.assertNotIn('password_hash', body['user'])
        self.assertEqual(body['confessions'][0]['content'], 'secret')
        self.assertEqual(body['messages'][0]['content'], 'hello')
        self.assertEqual(body['checkins'][0]['activity'], 'walk')

        deleted = self.client.delete('/account', headers=headers)
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get('/auth/me', headers=headers).status_code, 401)
        login = self.client.post(
            '/auth/login', json={'username': 'ivan', 'password': 'secret123'}
        )
        self.assertEqual(login.status_code, 401)

    def test_current_streak(self):
        today = date(2025, 10, 21)
        self.assertEqual(main1.current_streak([], today), 0)
        self.assertEqual(
            main1.current_streak([today - timedelta(days=1)], today), 1
        )
        self.assertEqual(
            main1.current_streak([today, today - timedelta(days=1)], today), 2
        )
        self.assertEqual(
            main1.current_streak([today - timedelta(days=2)], today), 0
        )

    def test_predict_text(self):
        headers = self.signup('dave')
        response = self.client.post(
            '/predict_text',
            json={'text': 'I had a nice lunch'},
            headers=headers,
        )
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body['level'], 'none')
        self.assertFalse(body['crisis'])
        self.assertTrue(body['about_self'])
        self.assertEqual(body['matched'], [])
        self.assertTrue(body['message'])

    def test_predict_text_crisis_is_deterministic(self):
        headers = self.signup('erin')
        body = self.client.post(
            '/predict_text',
            json={'text': 'I want to kill myself'},
            headers=headers,
        ).get_json()
        self.assertEqual(body['level'], 'crisis')
        self.assertTrue(body['crisis'])
        self.assertTrue(body['about_self'])
        self.assertEqual(body['matched'][0]['phrase'], 'kill myself')
        self.assertEqual(body['emergency'], '112')
        contacts = ' '.join(item['contact'] for item in body['resources'])
        self.assertIn('14416', contacts)
        self.assertIn('1800-599-0019', contacts)
        self.assertIn('98204 66726', contacts)

    def test_negation_is_not_crisis(self):
        headers = self.signup('erin2')
        body = self.client.post(
            '/predict_text',
            json={'text': 'I am not suicidal'},
            headers=headers,
        ).get_json()
        self.assertFalse(body['crisis'])
        self.assertNotEqual(body['level'], 'crisis')

    def test_third_party_is_support_not_crisis(self):
        headers = self.signup('erin3')
        body = self.client.post(
            '/predict_text',
            json={'text': 'my friend wants to kill himself'},
            headers=headers,
        ).get_json()
        self.assertFalse(body['crisis'])
        self.assertEqual(body['level'], 'support')
        self.assertFalse(body['about_self'])

    def test_historical_is_support_not_crisis(self):
        headers = self.signup('erin4')
        body = self.client.post(
            '/predict_text',
            json={'text': 'i used to cut myself'},
            headers=headers,
        ).get_json()
        self.assertFalse(body['crisis'])
        self.assertEqual(body['level'], 'support')
        self.assertTrue(body['about_self'])

    def test_analyze_chat_does_not_dilute_a_crisis(self):
        headers = self.signup('frank')
        for text in (
            'i had a good day',
            'work was fine',
            'i am tired',
            'i ate lunch',
            'i watched a show',
        ):
            self.client.post('/messages', json={'content': text}, headers=headers)
        self.client.post(
            '/messages', json={'content': 'i want to kill myself'}, headers=headers
        )

        body = self.client.post('/analyze_chat', headers=headers).get_json()
        self.assertEqual(body['level'], 'crisis')
        self.assertTrue(body['crisis'])
        self.assertEqual(body['matched'][0]['phrase'], 'kill myself')
        self.assertEqual(body['emergency'], '112')
        self.assertTrue(
            any('14416' in item['contact'] for item in body['resources'])
        )

    def test_analyze_chat_empty(self):
        headers = self.signup('grace')
        body = self.client.post('/analyze_chat', headers=headers).get_json()
        self.assertEqual(body['level'], 'none')
        self.assertFalse(body['crisis'])
        self.assertEqual(body['matched'], [])

    def test_transcribe_needs_a_file(self):
        headers = self.signup(self.username)
        self.assertEqual(
            self.client.post('/transcribe', headers=headers).status_code, 400
        )


if __name__ == '__main__':
    unittest.main()
