from flask import Flask, g, jsonify, request
from flask_cors import CORS
from faster_whisper import WhisperModel
from functools import wraps
import joblib
import os
import random
import secrets
import sqlite3
import tempfile
from werkzeug.security import check_password_hash, generate_password_hash
from safety import find_crisis_phrases, looks_third_person
from resources import crisis_resources

# Initialize Flask app
app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get('APP_DB_PATH', os.path.join(BASE_DIR, 'app.db'))

# Load text model
try:
    text_model = joblib.load(os.path.join(BASE_DIR, 'text_model.joblib'))
    print("Text model loaded successfully")
except Exception as e:
    print(f"Error loading text model: {str(e)}")
    text_model = None

# Speech model loads on first use so startup and tests stay fast
whisper_model = None

def get_whisper_model():
    global whisper_model
    if whisper_model is None:
        whisper_model = WhisperModel('tiny.en', device='cpu', compute_type='int8')
    return whisper_model

CRISIS_MESSAGE = (
    "What you wrote sounds like you may be thinking about suicide or hurting yourself. "
    "You deserve support right now. You do not have to go through this alone."
)

THIRD_PARTY_MESSAGE = (
    "It sounds like someone you know may be thinking about suicide or self-harm. "
    "You can help by staying with them and helping them contact a crisis line."
)

HISTORICAL_MESSAGE = (
    "Thank you for sharing something from the past. If those thoughts come back, "
    "please reach out to someone you trust or a crisis line."
)

SUPPORT_MESSAGES = [
    "That sounds heavy. You do not have to carry it alone. Talking to someone you trust can help.",
    "Thank you for putting that into words. Be gentle with yourself today, and reach out if it gets too much.",
]

NEUTRAL_MESSAGE = "Thanks for checking in. How are you feeling right now?"


def _model_suggests_support(text):
    """The model is only a weak signal for a supportive message."""
    if text_model is None or len(text.strip()) < 40 or looks_third_person(text):
        return False
    probabilities = text_model.predict_proba([text])[0]
    predicted = int(text_model.classes_[probabilities.argmax()])
    return predicted in (1, 2) and max(probabilities) >= 0.8


def _result(level, crisis, about_self, matches, message):
    resources, emergency = crisis_resources() if matches else ([], None)
    return {
        'level': level,
        'crisis': crisis,
        'about_self': about_self,
        'matched': [match.to_dict() for match in matches],
        'message': message,
        'resources': resources,
        'emergency': emergency,
    }


def analyze(text):
    matches = find_crisis_phrases(text)
    current_self = [match for match in matches if match.urgent and match.about_self]
    current_other = [match for match in matches if match.urgent and not match.about_self]
    historical = [match for match in matches if match.historical]

    if current_self:
        return _result('crisis', True, True, matches, CRISIS_MESSAGE)
    if current_other:
        return _result('support', False, False, matches, THIRD_PARTY_MESSAGE)
    if historical:
        return _result('support', False, True, matches, HISTORICAL_MESSAGE)
    if _model_suggests_support(text):
        return _result('support', False, True, matches, random.choice(SUPPORT_MESSAGES))
    return _result('none', False, True, matches, NEUTRAL_MESSAGE)


def analyze_messages(messages):
    if not messages:
        return _result('none', False, True, [], 'No messages to analyze yet.')

    results = [analyze(message) for message in messages]
    chosen = next((result for result in results if result['crisis']), None)
    if chosen is None:
        chosen = next((result for result in results if result['level'] == 'support'), None)
    if chosen is None:
        return _result('none', False, True, [], NEUTRAL_MESSAGE)
    return chosen


def get_db():
    if 'db' not in g:
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys = ON')
        g.db = db
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    db = sqlite3.connect(DB_PATH)
    try:
        db.execute('PRAGMA journal_mode = WAL')
        db.executescript(
            '''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            CREATE TABLE IF NOT EXISTS confessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            CREATE TABLE IF NOT EXISTS streaks (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                streak INTEGER NOT NULL,
                last_completion_date TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            '''
        )
        db.commit()
    finally:
        db.close()

init_db()

def create_session(user_id):
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute('INSERT INTO sessions (token, user_id) VALUES (?, ?)', (token, user_id))
    db.commit()
    return {'token': token}

def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        header = request.headers.get('Authorization', '')
        token = header.removeprefix('Bearer ').strip()
        row = None
        if token:
            row = get_db().execute(
                'SELECT user_id FROM sessions WHERE token = ?', (token,)
            ).fetchone()
        if row is None:
            return jsonify({'error': 'Unauthorized'}), 401
        g.user_id = row['user_id']
        g.token = token
        return view(*args, **kwargs)

    return wrapper

@app.route('/auth/signup', methods=['POST'])
def signup():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    db = get_db()
    try:
        cursor = db.execute(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already taken'}), 409

    return jsonify(create_session(cursor.lastrowid)), 201

@app.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    user = get_db().execute(
        'SELECT id, password_hash FROM users WHERE username = ?', (username,)
    ).fetchone()
    if user is None or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid username or password'}), 401

    return jsonify(create_session(user['id']))

@app.route('/auth/logout', methods=['POST'])
@require_auth
def logout():
    db = get_db()
    db.execute('DELETE FROM sessions WHERE token = ?', (g.token,))
    db.commit()
    return jsonify({'ok': True})

@app.route('/auth/me')
@require_auth
def me():
    user = get_db().execute(
        'SELECT id, username FROM users WHERE id = ?', (g.user_id,)
    ).fetchone()
    return jsonify(dict(user))

@app.route('/predict_text', methods=['POST'])
@require_auth
def predict_text():
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'No text provided'}), 400

    try:
        return jsonify(analyze(text))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/transcribe', methods=['POST'])
@require_auth
def transcribe():
    audio = request.files.get('file')
    if not audio:
        return jsonify({'error': 'No audio file provided'}), 400

    try:
        model = get_whisper_model()
    except Exception as e:
        return jsonify({'error': f'Speech model unavailable: {str(e)}'}), 503

    path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.m4a') as tmp:
            audio.save(tmp)
            path = tmp.name

        segments, _ = model.transcribe(path, language='en', vad_filter=True)
        text = ' '.join(segment.text.strip() for segment in segments).strip()
        return jsonify({'text': text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if path and os.path.exists(path):
            os.remove(path)

@app.route('/confessions', methods=['POST'])
@require_auth
def create_confession():
    data = request.get_json(silent=True) or {}
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({'error': 'Content is required'}), 400
    if len(content) > 500:
        return jsonify({'error': 'Confession must be 500 characters or less'}), 400

    db = get_db()
    cursor = db.execute('INSERT INTO confessions (content) VALUES (?)', (content,))
    db.commit()
    row = db.execute(
        'SELECT id, content, created_at FROM confessions WHERE id = ?',
        (cursor.lastrowid,),
    ).fetchone()
    return jsonify(dict(row)), 201

@app.route('/messages', methods=['GET'])
@require_auth
def list_messages():
    rows = get_db().execute(
        '''SELECT id, content, created_at, user_id FROM chat_messages
           WHERE user_id = ? ORDER BY created_at DESC, id DESC''',
        (g.user_id,),
    ).fetchall()
    return jsonify([dict(row) for row in rows])

@app.route('/messages', methods=['POST'])
@require_auth
def create_message():
    data = request.get_json(silent=True) or {}
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({'error': 'Content is required'}), 400

    db = get_db()
    cursor = db.execute(
        'INSERT INTO chat_messages (user_id, content) VALUES (?, ?)',
        (g.user_id, content),
    )
    db.commit()
    row = db.execute(
        'SELECT id, content, created_at, user_id FROM chat_messages WHERE id = ?',
        (cursor.lastrowid,),
    ).fetchone()
    return jsonify(dict(row)), 201

@app.route('/analyze_chat', methods=['POST'])
@require_auth
def analyze_chat():
    rows = get_db().execute(
        '''SELECT content FROM chat_messages WHERE user_id = ?
           ORDER BY created_at DESC, id DESC''',
        (g.user_id,),
    ).fetchall()
    return jsonify(analyze_messages([row['content'] for row in rows]))

@app.route('/streak', methods=['GET'])
@require_auth
def get_streak():
    row = get_db().execute(
        'SELECT streak, last_completion_date FROM streaks WHERE user_id = ?',
        (g.user_id,),
    ).fetchone()
    if row is None:
        return jsonify({'streak': 0, 'last_completion_date': None})
    return jsonify(dict(row))

@app.route('/streak', methods=['PUT'])
@require_auth
def save_streak():
    data = request.get_json(silent=True) or {}
    try:
        streak = int(data.get('streak'))
        last_completion_date = str(data.get('last_completion_date'))
    except (TypeError, ValueError):
        return jsonify({'error': 'streak and last_completion_date are required'}), 400

    db = get_db()
    db.execute(
        '''INSERT INTO streaks (user_id, streak, last_completion_date)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
               streak = excluded.streak,
               last_completion_date = excluded.last_completion_date,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')''',
        (g.user_id, streak, last_completion_date),
    )
    db.commit()
    return jsonify({'streak': streak, 'last_completion_date': last_completion_date})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
