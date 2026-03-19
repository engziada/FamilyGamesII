"""
Family Games II — HTTP-only Flask server.

All real-time game logic now lives in Convex (convex/ directory).
Flask only serves page templates and static assets.
"""
import os
import logging
import sys
from datetime import timedelta

from flask import Flask, redirect, render_template, request, url_for, flash, jsonify
from dotenv import load_dotenv

# Load environment variables (.env first, then .env.local for Convex URL override)
load_dotenv()
load_dotenv('.env.local', override=True)

# ── Logging ─────────────────────────────────────────────────────────────
if not os.path.exists('logs'):
    os.makedirs('logs')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler(os.path.join('logs', 'app.log'), encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ── Flask app ───────────────────────────────────────────────────────────
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key-change-in-production')
app.config['SESSION_COOKIE_NAME'] = 'game_session'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=5)

# Convex URL injected into templates for JS SDK
CONVEX_URL = os.getenv('CONVEX_URL', '')


# ── Game catalog (static metadata — mirrors convex/helpers.ts) ──────────
GAME_CATALOG = {
    'charades':          {'title': 'بدون كلام',        'icon': 'fa-mask',            'mouthBased': False},
    'pictionary':        {'title': 'ارسم وخمن',        'icon': 'fa-paint-brush',     'mouthBased': False, 'disabled': True},
    'trivia':            {'title': 'بنك المعلومات',     'icon': 'fa-lightbulb',       'mouthBased': False},
    'rapid_fire':        {'title': 'الأسئلة السريعة',   'icon': 'fa-bolt',            'mouthBased': False},
    'twenty_questions':  {'title': 'عشرين سؤال',       'icon': 'fa-question-circle', 'mouthBased': True},
    'riddles':           {'title': 'الألغاز',           'icon': 'fa-brain',           'mouthBased': False},
    'bus_complete':      {'title': 'أتوبيس كومبليت',    'icon': 'fa-bus',             'mouthBased': False},
    'who_am_i':          {'title': 'من أنا؟',           'icon': 'fa-user-secret',     'mouthBased': True},
}


# ── Routes ──────────────────────────────────────────────────────────────

@app.route('/')
def index():
    """Home page — game catalog grid."""
    return render_template('index.html',
                           game_catalog=GAME_CATALOG,
                           convex_url=CONVEX_URL)


@app.route('/game/<room_id>')
def game(room_id: str):
    """Game page — served for any valid Convex room ID.

    Player name is passed via query param; Convex SDK handles auth & state.
    """
    player_name = request.args.get('player_name', '')
    game_type = request.args.get('game_type', '')

    if not player_name:
        # Redirect to index with join=<room_id> so the join modal auto-opens
        return redirect(url_for('index', join=room_id))

    meta = GAME_CATALOG.get(game_type, {})

    return render_template('game.html',
                           room_id=room_id,
                           player_name=player_name,
                           game_type=game_type,
                           game_title=meta.get('title', game_type),
                           game_icon=meta.get('icon', 'fa-gamepad'),
                           mouth_based=meta.get('mouthBased', False),
                           convex_url=CONVEX_URL)


@app.route('/api/catalog')
def api_catalog():
    """JSON endpoint for game catalog (used by frontend if needed)."""
    return jsonify(GAME_CATALOG)


# ── Main ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    logger.info('=' * 50)
    logger.info('Family Games II Server Starting (HTTP-only)')
    logger.info('Real-time logic handled by Convex')
    logger.info('Running on http://127.0.0.1:5005')
    logger.info('Press Ctrl+C to stop')
    logger.info('=' * 50)

    try:
        app.run(host='127.0.0.1', port=5005, debug=True)
    except KeyboardInterrupt:
        logger.info('\nShutting down server...')
        sys.exit(0)
