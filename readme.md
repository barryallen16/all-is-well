# ALL IS WELL

a mental health check-in app built with react native and flask.

## install dependencies

```bash
bun install
```

## run the flask backend

the backend serves auth, the data, the safety checks, the text model, and the speech-to-text.

```bash
cd backend
uv venv --python 3.12
uv pip install -r requirements.txt
uv run python main1.py
```

it listens on port 5000 and creates `app.db` on first start.
the speech model downloads on the first transcription (tiny.en, about 75MB), so that request needs internet.
the model is English only.

## create a .env file in the root of the folder

```bash
EXPO_PUBLIC_FLASK_BACKEND_ENDPOINT=your-flask-endpoint
```

replace with the actual value.
if the phone is on a different network, expose port 5000 with `ngrok http 5000` and use that URL.
if the phone and the backend share a network, use the machine's LAN address so the audio never leaves it.

## run the app

```bash
bunx expo start --go
```

scan the QR code with Expo Go.
accounts are username and password only, with no password recovery.

## run the backend tests

```bash
cd backend
uv run python -m unittest
```

## safety checks

crisis detection is a reviewed phrase list in `backend/safety.py`, not the model.
it handles negation ("i am not suicidal"), third-person posts ("my friend..."), and past tense ("i used to...").
it is deliberately narrow and will miss indirect distress, so the app is not a crisis service.

crisis responses include Indian helplines: Tele-MANAS (14416 or 1-800-891-4416), KIRAN (1800-599-0019), and AASRA (+91 98204 66726), plus emergency 112.
the app is India-only for now.
the app shows a disclaimer under the check-in form.

the text model is only a weak signal for a supportive message.
it cannot trigger the crisis card.
the baseline and the real-world check are:

```bash
cd backend
uv run python eval_model.py   # the hand-written phrase contract
uv run python eval_real.py    # 1170 real posts, needs internet
```

the real-world set is `av9ash/CSSR-S_labelled_suicidewatch_posts_reddit` (CC BY 4.0), used only for evaluation.
it is fetched at runtime and not stored here.

## what each tab does

- home: record a clip or type a thought. the mic is requested when you tap record, and recordings stop at 2 minutes. the backend transcribes the audio, then checks it for explicit crisis language. a match shows a support card and real crisis resources. a Get help button in the header shows the Indian helplines at any time. the model only adds a gentle message. the confession form is private to your account.
- activity: one daily activity, a server-computed streak, and recent check-ins, stored in `app.db`.
- chat: your messages, stored in `app.db`, with an option to check in on the history. one explicit crisis message wins; benign messages do not average it away. the support card shows the message that triggered it.
- profile: your private journal. read or delete saved confessions, export your data, or delete your account.

## backend routes

authenticated routes need `Authorization: Bearer <token>`.

| route                            | auth | input                                             | output                                                                                                                                               |
| -------------------------------- | ---- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/signup`              | no   | `{"username": "...", "password": "..."}`          | `{"token": "..."}`                                                                                                                                   |
| `POST /auth/login`               | no   | `{"username": "...", "password": "..."}`          | `{"token": "..."}`                                                                                                                                   |
| `POST /auth/logout`              | yes  | none                                              | `{"ok": true}`                                                                                                                                       |
| `GET /auth/me`                   | yes  | none                                              | `{"id": 1, "username": "..."}`                                                                                                                       |
| `GET /account/export`            | yes  | none                                              | the user, confessions, messages, and check-ins                                                                                                       |
| `DELETE /account`                | yes  | none                                              | `{"ok": true}` and deletes the account                                                                                                               |
| `GET /resources`                 | no   | none                                              | `{"resources": [...], "emergency": "112"}`                                                                                                           |
| `POST /transcribe`               | yes  | multipart `file`                                  | `{"text": "..."}`                                                                                                                                    |
| `POST /predict_text`             | yes  | `{"text": "..."}`                                 | `{"level": "crisis\|support\|none", "crisis": true, "about_self": true, "matched": [...], "message": "...", "resources": [...], "emergency": "112"}` |
| `POST /confessions`              | yes  | `{"content": "..."}`                              | the saved confession                                                                                                                                 |
| `GET /confessions`               | yes  | none                                              | the user's confessions                                                                                                                               |
| `DELETE /confessions/<id>`       | yes  | none                                              | `{"ok": true}` if the user owns it                                                                                                                   |
| `GET /messages`                  | yes  | none                                              | the user's messages                                                                                                                                  |
| `POST /messages`                 | yes  | `{"content": "..."}`                              | the saved message                                                                                                                                    |
| `POST /analyze_chat`             | yes  | none                                              | the same shape with evidence for the winning message; any crisis message wins                                                                        |
| `GET /checkins?today=YYYY-MM-DD` | yes  | none                                              | `{"streak": 0, "checkins": [...]}`                                                                                                                   |
| `POST /checkins`                 | yes  | `{"local_date": "YYYY-MM-DD", "activity": "..."}` | the saved check-in                                                                                                                                   |

deleting an account removes its sessions, confessions, messages, and check-ins.
sessions expire after 30 days; the app clears the token and returns to sign-in on a 401.
