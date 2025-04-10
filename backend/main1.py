from flask import Flask, request, jsonify
from flask_cors import CORS
from faster_whisper import WhisperModel
import joblib
import os
import random
import requests  # For Supabase API calls
import tempfile

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Supabase configuration (replace with your actual values)
SUPABASE_URL = "https://dzlhehodyvemnfyfugov.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6bGhlaG9keXZlbW5meWZ1Z292Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI0MTI3MjcsImV4cCI6MjA1Nzk4ODcyN30.lMUnXxA3Xn2vL5ezRHz49uy--A-sQLHKS-gV4yXfbuY"  # Use the anon key from Supabase dashboard

# Load text model
try:
    text_model = joblib.load('text_model.joblib')
    print("Text model loaded successfully")
except Exception as e:
    print(f"Error loading text model: {str(e)}")
    text_model = None

# Load speech-to-text model (downloads ~75MB on first run)
try:
    whisper_model = WhisperModel('tiny.en', device='cpu', compute_type='int8')
    print("Speech model loaded successfully")
except Exception as e:
    print(f"Error loading speech model: {str(e)}")
    whisper_model = None

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
    
    message = random.choice(motivational_responses[risk_label])
    return risk_label, message

@app.route('/predict_text', methods=['POST'])
def predict_text():
    try:
        data = request.get_json()
        text = data.get('text', '')
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        risk_score = analyze_text(text)
        risk_score = int(risk_score)
        risk_label = {0: 'Low', 1: 'Medium', 2: 'High'}[risk_score]
        
        message = random.choice(motivational_responses[risk_label])
        
        return jsonify({
            'risk': risk_label,
            'score': risk_score,
            'message': message
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if whisper_model is None:
        return jsonify({'error': 'Speech model not loaded'}), 503

    audio = request.files.get('file')
    if not audio:
        return jsonify({'error': 'No audio file provided'}), 400

    path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.m4a') as tmp:
            audio.save(tmp)
            path = tmp.name

        segments, _ = whisper_model.transcribe(path, language='en', vad_filter=True)
        text = ' '.join(segment.text.strip() for segment in segments).strip()
        return jsonify({'text': text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if path and os.path.exists(path):
            os.remove(path)

@app.route('/send_message', methods=['POST'])
def send_message():
    try:
        data = request.get_json()
        user_id = data.get('user_id')  # From Supabase auth
        content = data.get('content')
        if not user_id or not content:
            return jsonify({'error': 'Missing user_id or content'}), 400
        
        # Send message to Supabase
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "user_id": user_id,
            "content": content
        }
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/chat_messages",
            json=payload,
            headers=headers
        )
        
        if response.status_code != 201:
            return jsonify({'error': 'Failed to save message'}), 500
        
        return jsonify({'message': 'Message sent successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/analyze_chat', methods=['POST'])
def analyze_chat():
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        if not user_id:
            return jsonify({'error': 'Missing user_id'}), 400
        
        # Fetch messages from Supabase
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/chat_messages?user_id=eq.{user_id}&select=content",
            headers=headers
        )
        
        if response.status_code != 200:
            return jsonify({'error': 'Failed to fetch messages'}), 500
        
        messages = [msg['content'] for msg in response.json()]
        risk_label, message = analyze_chat_messages(messages)
        
        return jsonify({
            'risk': risk_label,
            'message': message
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)