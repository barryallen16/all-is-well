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
        self.assertEqual(self.client.get('/streak').status_code, 401)
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

    def test_confession_and_streak(self):
        headers = self.signup('carol')

        confession = self.client.post(
            '/confessions', json={'content': 'a secret'}, headers=headers
        )
        self.assertEqual(confession.status_code, 201)
        self.assertEqual(confession.get_json()['content'], 'a secret')

        empty = self.client.get('/streak', headers=headers).get_json()
        self.assertEqual(empty, {'streak': 0, 'last_completion_date': None})

        saved = self.client.put(
            '/streak',
            json={'streak': 4, 'last_completion_date': '2025-04-10'},
            headers=headers,
        )
        self.assertEqual(saved.status_code, 200)

        loaded = self.client.get('/streak', headers=headers).get_json()
        self.assertEqual(loaded, {'streak': 4, 'last_completion_date': '2025-04-10'})

    def test_predict_text(self):
        headers = self.signup('dave')
        response = self.client.post(
            '/predict_text',
            json={'text': 'I feel hopeless and tired'},
            headers=headers,
        )
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertIn(body['risk'], ('Low', 'Medium', 'High'))
        self.assertIn(body['score'], (0, 1, 2))
        self.assertTrue(body['message'])

    def test_high_risk_gets_the_crisis_line(self):
        self.assertIn('crisis line', main1.encouragement('High'))
        self.assertNotIn('crisis line', main1.encouragement('Low'))

    def test_transcribe_needs_a_file(self):
        headers = self.signup(self.username)
        self.assertEqual(
            self.client.post('/transcribe', headers=headers).status_code, 400
        )


if __name__ == '__main__':
    unittest.main()
