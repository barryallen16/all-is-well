# ALL IS WELL

a mental health check-in app built with react native and flask.

## install dependencies

```bash
bun install
```

## run the flask backend

the backend serves auth, the data, the risk model, and the speech-to-text.

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

## what each tab does

- home: record a clip or type a thought. the backend transcribes the audio, then the risk model scores the text and returns a message. high scores also show a crisis line.
- activity: one daily activity and a streak, stored in `app.db`.
- chat: your messages, stored in `app.db`, with an option to analyze the history.

## backend routes

authenticated routes need `Authorization: Bearer <token>`.

| route | auth | input | output |
| --- | --- | --- | --- |
| `POST /auth/signup` | no | `{"username": "...", "password": "..."}` | `{"token": "..."}` |
| `POST /auth/login` | no | `{"username": "...", "password": "..."}` | `{"token": "..."}` |
| `POST /auth/logout` | yes | none | `{"ok": true}` |
| `GET /auth/me` | yes | none | `{"id": 1, "username": "..."}` |
| `POST /transcribe` | yes | multipart `file` | `{"text": "..."}` |
| `POST /predict_text` | yes | `{"text": "..."}` | `{"risk": "Low\|Medium\|High", "score": 0-2, "message": "..."}` |
| `POST /confessions` | yes | `{"content": "..."}` | the saved confession |
| `GET /messages` | yes | none | the user's messages |
| `POST /messages` | yes | `{"content": "..."}` | the saved message |
| `POST /analyze_chat` | yes | none | risk and message for the user's history |
| `GET /streak` | yes | none | `{"streak": 0, "last_completion_date": null}` |
| `PUT /streak` | yes | `{"streak": 3, "last_completion_date": "2025-04-10"}` | the saved streak |
