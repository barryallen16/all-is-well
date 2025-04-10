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

motivational_responses = {
    "Low": [
        "You're doing amazing! Keep spreading positivity wherever you go.",
        "Your strength is inspiring—keep up the great work!",
        "You’ve got a bright spirit! Celebrate the little wins today.",
        "Keep that positive energy flowing—you’re on the right track!",
        "You’re thriving! Take a moment to appreciate how far you’ve come."
    ],
    "Medium": [
        "It’s okay to have off days—take a deep breath and give yourself some grace.",
        "You’re stronger than you realize. Maybe try a calming activity like journaling?",
        "Some days are tougher, but you’ve got this! How about a warm cup of tea to relax?",
        "You’re doing your best, and that’s enough. Take it one step at a time.",
        "It’s okay to feel this way. Maybe a short walk or some music can lift your spirits?"
    ],
    "High": [
        "You’re not alone in this—reaching out to a friend or loved one can make a big difference.",
        "Tough moments don’t last forever. You’re enough, just as you are, and help is always there.",
        "It’s okay to feel overwhelmed. Consider talking to someone you trust when you’re ready.",
        "You’re stronger than you think, even on hard days. Small steps forward are still progress.",
        "You deserve care and support—don’t hesitate to reach out to someone who can listen."
    ]
}

CRISIS_MESSAGE = (
    "If you are in danger or thinking about harming yourself, contact your local "
    "emergency number or a crisis line right away."
)

def encouragement(risk_label):
    message = random.choice(motivational_responses[risk_label])
    if risk_label == "High":
        message = f"{message}\n\n{CRISIS_MESSAGE}"
    return message

def analyze_text(text):
    if text_model is None:
        raise Exception("Text model not loaded")
    return text_model.predict([text])[0]

def analyze_chat_messages(messages):
    if not messages:
        return "Low", "No messages to analyze yet—keep chatting!"

    # Aggregate scores from all messages
    scores = [int(analyze_text(msg)) for msg in messages]
    avg_score = sum(scores) / len(scores)

    # Map average score to risk level
    if avg_score < 0.5:
        risk_label = "Low"
    elif avg_score < 1.5:
        risk_label = "Medium"
    else:
        risk_label = "High"

    return risk_label, encouragement(risk_label)

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
    try:
        data = request.get_json() or {}
        text = data.get('text', '')
        if not text:
            return jsonify({'error': 'No text provided'}), 400

        risk_score = int(analyze_text(text))
        risk_label = {0: 'Low', 1: 'Medium', 2: 'High'}[risk_score]

        return jsonify({
            'risk': risk_label,
            'score': risk_score,
            'message': encouragement(risk_label)
        })
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
        'SELECT content FROM chat_messages WHERE user_id = ?', (g.user_id,)
    ).fetchall()
    risk_label, message = analyze_chat_messages([row['content'] for row in rows])
    return jsonify({'risk': risk_label, 'message': message})

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
