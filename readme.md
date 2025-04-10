# ALL IS WELL

a mental health check-in app built with react native and supabase.

## install dependencies

```bash
bun install
```

## run the flask backend

the backend serves the risk model and the speech-to-text.

```bash
cd backend
uv venv --python 3.12
uv pip install -r requirements.txt
uv run python main1.py
```

it listens on port 5000.
the first start downloads the tiny.en speech model (about 75MB), so it needs internet once.
the model is English only.

## create a .env file in the root of the folder

```bash
EXPO_PUBLIC_FLASK_BACKEND_ENDPOINT=your-flask-endpoint
EXPO_PUBLIC_SUPABASE_URL=your-supabase-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

replace with the actual values.
if the phone is on a different network, expose port 5000 with `ngrok http 5000` and use that URL.
if the phone and the backend share a network, use the machine's LAN address so the audio never leaves it.

## run the app

```bash
bunx expo start --go
```

scan the QR code with Expo Go.

## what each tab does

- home: record a clip or type a thought. the backend transcribes the audio, then the risk model scores the text.
- activity: one daily activity and a streak, stored in supabase.
- chat: messages stored in supabase, with an option to analyze the user's history.

## backend routes

| route | input | output |
| --- | --- | --- |
| `POST /transcribe` | multipart `file` | `{"text": "..."}` |
| `POST /predict_text` | `{"text": "..."}` | `{"risk": "Low\|Medium\|High", "score": 0-2, "message": "..."}` |
| `POST /send_message` | `{"user_id": "...", "content": "..."}` | saves a chat message |
| `POST /analyze_chat` | `{"user_id": "..."}` | risk and message for the user's chat history |
