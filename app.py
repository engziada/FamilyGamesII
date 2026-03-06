import eventlet
eventlet.monkey_patch()

from flask import Flask, redirect, render_template, session, request, copy_current_request_context, url_for, make_response, flash
from flask_socketio import SocketIO, emit, join_room, leave_room
import logging
import os
import json
import random
from datetime import datetime, timedelta
from games.charades.models import CharadesGame
from games.trivia.models import TriviaGame
from games.pictionary.models import PictionaryGame
from games.bus_complete.models import BusCompleteGame
from games.rapid_fire.models import RapidFireGame
from games.twenty_questions.models import TwentyQuestionsGame
from games.riddles.models import RiddlesGame
from services.data_manager import DataManager
import time
import uuid
from dotenv import load_dotenv
import signal
import sys

# Load environment variables
load_dotenv()

# Configure logging
if not os.path.exists('Log'):
    os.makedirs('Log')

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler(os.path.join('Log', 'app.log'), encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key-change-in-production')
app.config['SESSION_COOKIE_NAME'] = 'game_session'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=5)

# Push application context
app.app_context().push()

# Initialize SocketIO
socketio = SocketIO(
    app,
    manage_session=True,
    cors_allowed_origins="*",
    async_mode='eventlet',
    ping_timeout=15000,
    ping_interval=25000
)

# Game rooms storage
game_rooms = {}
player_sids = {}

def get_player_sid(player_name):
    return player_sids.get(player_name)

@app.before_request
def make_session_permanent():
    session.permanent = True

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/game/<game_id>')
def game(game_id):
    try:
        game_id = str(game_id)
        if game_id not in game_rooms:
            flash('الغرفة غير موجودة', 'error')
            return redirect(url_for('index'))
            
        game_obj = game_rooms[game_id]
        player_name = request.args.get('player_name') or session.get('player_name')
        
        if not player_name or not any(p['name'] == player_name for p in game_obj.players):
            flash('انت مش في اللعبة دي', 'error')
            return redirect(url_for('index'))
            
        session['game_id'] = game_id
        session['player_name'] = player_name
        session['is_host'] = (game_obj.host == player_name)
        
        return render_template('game.html', 
                            game_id=game_id,
                            player_name=player_name,
                            game_type=game_obj.game_type,
                            is_host=session['is_host'],
                            player_type='host' if session['is_host'] else 'guest')
    except Exception as e:
        logger.error(f"Error in game route: {str(e)}")
        return redirect(url_for('index'))

@socketio.on('connect')
def handle_connect():
    player_name = session.get('player_name')
    if player_name:
        player_sids[player_name] = request.sid

@socketio.on('create_game')
def handle_create_game(data):
    try:
        game_id = str(data.get('game_id'))
        player_name = data.get('player_name')
        game_type = data.get('game_type')
        settings = data.get('settings', {})
        
        if not game_id or not player_name:
            raise ValueError("معلومات ناقصة")
            
        if game_type == 'bus_complete':
            game_obj = BusCompleteGame(game_id, player_name, settings)
        elif game_type == 'trivia':
            game_obj = TriviaGame(game_id, player_name, settings)
        elif game_type == 'pictionary':
            game_obj = PictionaryGame(game_id, player_name, settings)
        elif game_type == 'rapid_fire':
            game_obj = RapidFireGame(game_id, player_name, settings)
        elif game_type == 'twenty_questions':
            game_obj = TwentyQuestionsGame(game_id, player_name, settings)
        elif game_type == 'riddles':
            game_obj = RiddlesGame(game_id, player_name, settings)
        else:
            game_obj = CharadesGame(game_id, player_name, settings)
            
        game_rooms[game_id] = game_obj
        session['game_id'] = game_id
        session['player_name'] = player_name
        session['is_host'] = True
        
        emit('game_created', {'game_id': game_id, 'host': player_name, 'players': game_obj.players})
        join_room(game_id)
    except Exception as e:
        emit('error', {'message': str(e)})

@socketio.on('join_game')
def handle_join_game(data):
    try:
        game_id = str(data['game_id'])
        player_name = data['player_name']
        if game_id not in game_rooms: raise ValueError("الغرفة غير موجودة")
        game_obj = game_rooms[game_id]
        game_obj.add_player(player_name)
        session['game_id'] = game_id
        session['player_name'] = player_name
        session['is_host'] = False
        join_room(game_id)
        emit('join_success', {'game_id': game_id, 'players': game_obj.players, 'host': game_obj.host})
        emit('player_joined', {'players': game_obj.players}, room=game_id)
    except Exception as e:
        emit('error', {'message': str(e)})

@socketio.on('start_game')
def handle_start_game(data):
    try:
        game_id = str(data['game_id'])
        game_obj = game_rooms.get(game_id)
        if game_obj and session.get('player_name') == game_obj.host:
            game_obj.start_game()
            if game_obj.game_type in ['charades', 'pictionary']:
                game_obj.set_current_item(game_obj.get_item())
                if game_obj.game_type == 'pictionary':
                    game_obj.clear_canvas()
            
            emit('game_started', {
                'game_id': game_id,
                'redirect_url': f'/game/{game_id}',
                'transfer_id': str(uuid.uuid4())
            }, room=game_id)
            emit_game_state(game_id)
    except Exception as e:
        emit('error', {'message': str(e)})

@socketio.on('player_ready')
def handle_player_ready(data):
    game_obj = game_rooms.get(str(data.get('game_id')))
    if game_obj and game_obj.game_type != 'trivia' and game_obj.current_player == session.get('player_name'):
        game_obj.status = 'round_active'
        if hasattr(game_obj, 'start_round_timer'): game_obj.start_round_timer()
        emit('force_reset_timer', {'current_player': game_obj.current_player, 'game_status': game_obj.status}, room=game_obj.game_id)
        limit = game_obj.settings.get('time_limit', 90)
        emit('timer_start', {'duration': limit}, room=game_obj.game_id)
        emit_game_state(game_obj.game_id)

@socketio.on('guess_correct')
def handle_guess_correct(data):
    game_obj = game_rooms.get(str(data.get('game_id')))
    guesser = data.get('player_name')
    if game_obj and game_obj.game_type in ['charades', 'pictionary']:
        points = CharadesGame.calculate_score(game_obj.round_start_time)
        if points > 0:
            game_obj.add_score(game_obj.current_player, points)
            game_obj.add_score(guesser, points)
            if game_obj.settings.get('teams'):
                p1 = next((p for p in game_obj.players if p['name'] == game_obj.current_player), None)
                p2 = next((p for p in game_obj.players if p['name'] == guesser), None)
                if p1: game_obj.team_scores[str(p1['team'])] += points
                if p2: game_obj.team_scores[str(p2['team'])] += points

        game_obj.next_round(game_obj.get_item())
        game_obj.status = 'playing'
        emit('correct_guess', {'guesser': guesser, 'performer': game_obj.current_player}, room=game_obj.game_id)
        emit('force_reset_timer', {'next_player': game_obj.current_player, 'game_status': game_obj.status}, room=game_obj.game_id)
        
        if game_obj.game_type == 'pictionary':
            game_obj.clear_canvas()
            emit('clear_canvas', room=game_obj.game_id)
            
        emit_game_state(game_obj.game_id)
        sid = get_player_sid(game_obj.current_player)
        if sid: emit('new_item', game_obj.current_item, room=sid)

@socketio.on('submit_answer')
def handle_submit_answer(data):
    game_obj = game_rooms.get(str(data.get('game_id')))
    ans_idx = int(data.get('answer_idx'))
    player_name = session.get('player_name')

    if game_obj and game_obj.game_type == 'trivia' and game_obj.question_active:
        # Track that this player has answered
        game_obj.players_answered.add(player_name)
        
        correct = (ans_idx == game_obj.current_question['answer'])

        if correct:
            game_obj.question_active = False # Disable question once answered correctly
            game_obj.add_score(player_name, 10)

            emit('answer_result', {
                'player': player_name,
                'is_correct': True,
                'correct_answer': game_obj.current_question['options'][game_obj.current_question['answer']]
            }, room=game_obj.game_id)

            # Move to next question after a short delay for everyone to see result
            eventlet.sleep(2)
            game_obj.next_round()
            emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)}, room=game_obj.game_id)
            emit_game_state(game_obj.game_id)
        else:
            # Track wrong answer
            game_obj.players_answered_wrong.add(player_name)
            
            # Individual feedback for wrong answer
            emit('answer_result', {
                'player': player_name,
                'is_correct': False,
                'correct_answer': None # Don't reveal yet
            })
            
            # Check if all players have answered wrong
            total_players = len(game_obj.players)
            if len(game_obj.players_answered_wrong) == total_players:
                # All players answered wrong, move to next question without revealing answer
                game_obj.question_active = False
                eventlet.sleep(2)
                game_obj.next_round()
                emit('all_wrong', {'message': 'كل اللاعبين جاوبوا غلط! السؤال التالي...'}, room=game_obj.game_id)
                emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)}, room=game_obj.game_id)
                emit_game_state(game_obj.game_id)

@socketio.on('round_timeout')
def handle_round_timeout(data):
    game_obj = game_rooms.get(str(data.get('game_id')))
    if game_obj:
        if game_obj.game_type in ['charades', 'pictionary']:
            emit('reveal_item', game_obj.current_item, room=game_obj.game_id)
            game_obj.next_round(game_obj.get_item())
            game_obj.status = 'playing'
            emit('round_timeout', {'next_player': game_obj.current_player, 'game_status': game_obj.status}, room=game_obj.game_id)
            sid = get_player_sid(game_obj.current_player)
            if sid: emit('new_item', game_obj.current_item, room=sid)
            if game_obj.game_type == 'pictionary':
                game_obj.clear_canvas()
                emit('clear_canvas', room=game_obj.game_id)
        else:
            # Trivia timeout
            game_obj.next_round()
            emit('round_timeout', {'game_status': game_obj.status}, room=game_obj.game_id)
            emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)}, room=game_obj.game_id)

        emit_game_state(game_obj.game_id)

@socketio.on('player_passed')
def handle_player_passed(data):
    game_obj = game_rooms.get(str(data.get('game_id')))
    if game_obj and game_obj.game_type != 'trivia' and game_obj.current_player == session.get('player_name'):
        handle_turn_skip(game_obj, session.get('player_name'))

@socketio.on('force_next_turn')
def handle_force_next_turn(data):
    game_obj = game_rooms.get(str(data.get('game_id')))
    if game_obj and game_obj.host == session.get('player_name'):
        handle_turn_skip(game_obj, "المضيف")

def handle_turn_skip(game_obj, skipper_name):
    if game_obj.game_type in ['charades', 'pictionary']:
        emit('reveal_item', game_obj.current_item, room=game_obj.game_id)
        item = game_obj.get_item()
        game_obj.next_round(item)
        game_obj.status = 'playing'
        emit('pass_turn', {'player': skipper_name, 'next_player': game_obj.current_player, 'game_status': game_obj.status}, room=game_obj.game_id)
        if game_obj.game_type == 'pictionary':
            game_obj.clear_canvas()
            emit('clear_canvas', room=game_obj.game_id)
        sid = get_player_sid(game_obj.current_player)
        if sid: emit('new_item', game_obj.current_item, room=sid)
    else:
        # Trivia forced next
        game_obj.next_round()
        emit('pass_turn', {'player': skipper_name, 'game_status': game_obj.status}, room=game_obj.game_id)
        emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)}, room=game_obj.game_id)
        
    emit_game_state(game_obj.game_id)

@socketio.on('draw')
def handle_draw(data):
    rid = str(data.get('game_id'))
    game_obj = game_rooms.get(rid)
    if game_obj and game_obj.game_type == 'pictionary' and game_obj.current_player == session.get('player_name'):
        game_obj.add_stroke(data['stroke'])
        emit('draw', data['stroke'], room=rid, include_self=False)

@socketio.on('clear_canvas')
def handle_clear_canvas(data):
    rid = str(data.get('game_id'))
    game_obj = game_rooms.get(rid)
    if game_obj and game_obj.game_type == 'pictionary' and game_obj.current_player == session.get('player_name'):
        game_obj.clear_canvas()
        emit('clear_canvas', room=rid)

@socketio.on('submit_bus_answers')
def handle_submit_bus_answers(data):
    """Silently sync a player's current answers to the server.

    This is called frequently (on blur / debounced input) so we do NOT
    broadcast game state to avoid UI flicker for other players.
    """
    game_id = str(data.get('game_id'))
    answers = data.get('answers')
    player_name = session.get('player_name')
    if game_id in game_rooms:
        game_obj = game_rooms[game_id]
        if game_obj.game_type == 'bus_complete' and game_obj.status == 'round_active':
            if not game_obj.submit_answers(player_name, answers):
                emit('error', {'message': 'إجابات غير صالحة'})

@socketio.on('stop_bus')
def handle_stop_bus(data):
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    if game_id in game_rooms:
        game_obj = game_rooms[game_id]
        if game_obj.game_type == 'bus_complete' and game_obj.status == 'round_active':
            # Capture the current player's answers when they click Stop Bus
            # Other players' answers are already in partial_submissions via real-time updates
            if 'answers' in data:
                game_obj.submit_answers(player_name, data['answers'])
            # Stop the bus (collects all players' submissions from partial_submissions)
            game_obj.stop_bus(player_name)
            emit('bus_stopped', {'player': player_name}, room=game_id)
            emit_game_state(game_id)

@socketio.on('submit_validation_vote')
def handle_submit_validation_vote(data):
    """Handle player vote for answer validation."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    answer_key = data.get('answer_key')  # format: "player_name|category"
    is_valid = data.get('is_valid', True)

    if game_id in game_rooms:
        game_obj = game_rooms[game_id]
        if game_obj.game_type == 'bus_complete' and game_obj.status == 'validating':
            result = game_obj.submit_validation_vote(player_name, answer_key, is_valid)
            if result:
                # Emit updated validation state to all players
                emit('validation_updated', {
                    'answer_key': answer_key,
                    'status': result
                }, room=game_id)
                emit_game_state(game_id)

@socketio.on('finalize_validation')
def handle_finalize_validation(data):
    """Handle host finalizing the validation phase and calculating scores."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')

    if game_id in game_rooms:
        game_obj = game_rooms[game_id]
        if (game_obj.game_type == 'bus_complete' and
            game_obj.status == 'validating' and
            game_obj.host == player_name):
            if game_obj.finalize_validation():
                emit('validation_finalized', {}, room=game_id)
                emit_game_state(game_id)

@socketio.on('confirm_bus_scores')
def handle_confirm_bus_scores(data):
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    if game_id in game_rooms:
        game_obj = game_rooms[game_id]
        if game_obj.game_type == 'bus_complete' and game_obj.host == player_name:
            game_obj.next_round()
            emit_game_state(game_id)

# === Rapid Fire Game Events ===

@socketio.on('buzz_in')
def handle_buzz_in(data):
    """Handle player buzzing in for Rapid Fire game."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    
    if game_id not in game_rooms:
        emit('error', {'message': 'الغرفة غير موجودة'})
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'rapid_fire':
        emit('error', {'message': 'هذه اللعبة ليست أسئلة سريعة'})
        return
    
    result = game_obj.buzz(player_name)
    
    if result['success']:
        # Broadcast who buzzed to all players
        emit('buzz_registered', {
            'player': player_name,
            'time_limit': result['time_limit'],
            'message': result['message']
        }, room=game_id)
        # Start timer for buzzed player
        emit('buzz_timer_start', {'duration': result['time_limit']}, room=game_id)
    else:
        emit('buzz_rejected', {'message': result['message']})

@socketio.on('submit_buzz_answer')
def handle_submit_buzz_answer(data):
    """Handle answer submission after buzzing in Rapid Fire."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    answer_index = int(data.get('answer_idx', -1))
    
    if game_id not in game_rooms:
        emit('error', {'message': 'الغرفة غير موجودة'})
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'rapid_fire':
        return
    
    result = game_obj.submit_answer(player_name, answer_index)
    
    # Broadcast result to all players
    emit('buzz_answer_result', {
        'player': player_name,
        'correct': result['correct'],
        'points': result.get('points', 0),
        'message': result['message'],
        'correct_answer': result.get('correct_answer'),
        'scores': game_obj.scores
    }, room=game_id)
    
    if result['correct']:
        # Move to next question after short delay
        eventlet.sleep(2)
        next_q = game_obj.next_question()
        if next_q:
            emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)}, room=game_id)
        emit_game_state(game_id)
    else:
        # Unlock for other players to buzz
        emit('buzz_unlocked', {'message': 'يمكن للآخرين الضغط الآن'}, room=game_id)
        emit_game_state(game_id)

@socketio.on('buzz_timeout')
def handle_buzz_timeout(data):
    """Handle buzz timeout in Rapid Fire game."""
    game_id = str(data.get('game_id'))
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'rapid_fire':
        return
    
    result = game_obj.buzz_timeout()
    
    emit('buzz_timeout_event', {
        'message': result['message'],
        'correct_answer': result.get('correct_answer'),
        'unlocked': result['unlocked']
    }, room=game_id)
    
    emit_game_state(game_id)

@socketio.on('skip_rapid_question')
def handle_skip_rapid_question(data):
    """Host skips current question in Rapid Fire."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'rapid_fire':
        return
    
    if game_obj.host != player_name:
        emit('error', {'message': 'فقط المضيف يمكنه تخطي السؤال'})
        return
    
    next_q = game_obj.skip_question()
    
    if next_q:
        emit('question_skipped', {'message': 'تم تخطي السؤال'}, room=game_id)
        emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)}, room=game_id)
    else:
        emit('game_ended', {'message': 'انتهت اللعبة!', 'scores': game_obj.scores}, room=game_id)
    
    emit_game_state(game_id)

# === End Rapid Fire Events ===

# === Twenty Questions Game Events ===

@socketio.on('start_twenty_q')
def handle_start_twenty_q(data):
    """Start Twenty Questions game and assign thinker."""
    game_id = str(data.get('game_id'))
    
    if game_id not in game_rooms:
        emit('error', {'message': 'الغرفة غير موجودة'})
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'twenty_questions':
        return
    
    try:
        result = game_obj.start_game()
        emit('twenty_q_started', {
            'thinker': result['thinker'],
            'phase': result['phase'],
            'word_source': result['word_source']
        }, room=game_id)
        emit_game_state(game_id)
    except Exception as e:
        emit('error', {'message': str(e)})

@socketio.on('get_word_suggestion')
def handle_get_word_suggestion(data):
    """Get a random word suggestion for the thinker."""
    game_id = str(data.get('game_id'))
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'twenty_questions':
        return
    
    suggestion = game_obj.get_random_word_suggestion()
    if suggestion:
        emit('word_suggestion', suggestion)

@socketio.on('set_secret_word')
def handle_set_secret_word(data):
    """Set the secret word (thinker only)."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    word = data.get('word')
    category = data.get('category')
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'twenty_questions':
        return
    
    if game_obj.thinker != player_name:
        emit('error', {'message': 'فقط المفكر يحدد الكلمة'})
        return
    
    result = game_obj.set_secret_word(word, category)
    
    emit('secret_word_set', {
        'phase': result['phase'],
        'category_hint': result['category_hint']
    }, room=game_id)
    emit_game_state(game_id)

@socketio.on('ask_twenty_q')
def handle_ask_twenty_q(data):
    """Ask a question in Twenty Questions."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    question = data.get('question')
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'twenty_questions':
        return
    
    result = game_obj.ask_question(player_name, question)
    
    if result['success']:
        emit('question_asked', {
            'question': result['question'],
            'asker': result['asker'],
            'question_number': result['question_number']
        }, room=game_id)
    else:
        emit('question_rejected', {'message': result['message']})

@socketio.on('answer_twenty_q')
def handle_answer_twenty_q(data):
    """Answer a question in Twenty Questions (thinker only)."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    answer = data.get('answer')  # 'yes', 'no', 'maybe'
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'twenty_questions':
        return
    
    if game_obj.thinker != player_name:
        emit('error', {'message': 'فقط المفكر يجيب'})
        return
    
    result = game_obj.answer_question(answer)
    
    if result['success']:
        emit('question_answered', {
            'answer': result['answer'],
            'question_count': result['question_count'],
            'questions_remaining': result['questions_remaining'],
            'phase': result.get('phase'),
            'message': result.get('message')
        }, room=game_id)
        emit_game_state(game_id)

@socketio.on('make_twenty_q_guess')
def handle_make_twenty_q_guess(data):
    """Make a final guess in Twenty Questions."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    guess = data.get('guess')
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'twenty_questions':
        return
    
    result = game_obj.make_guess(player_name, guess)
    
    if result['success']:
        emit('guess_result', {
            'correct': result['correct'],
            'secret_word': result.get('secret_word'),
            'winner': result.get('winner'),
            'points': result.get('points'),
            'message': result['message'],
            'continue': result.get('continue', False)
        }, room=game_id)
        emit_game_state(game_id)

@socketio.on('forfeit_twenty_q')
def handle_forfeit_twenty_q(data):
    """Give up in Twenty Questions."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'twenty_questions':
        return
    
    result = game_obj.forfeit(player_name)
    
    emit('game_forfeited', {
        'secret_word': result['secret_word'],
        'category': result['category'],
        'message': result['message']
    }, room=game_id)
    emit_game_state(game_id)

# === End Twenty Questions Events ===

# === Riddles Game Events ===

@socketio.on('start_riddles')
def handle_start_riddles(data):
    """Start Riddles game."""
    game_id = str(data.get('game_id'))
    
    if game_id not in game_rooms:
        emit('error', {'message': 'الغرفة غير موجودة'})
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'riddles':
        return
    
    try:
        result = game_obj.start_game()
        if result:
            emit('riddle_started', result, room=game_id)
            emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)}, room=game_id)
            emit_game_state(game_id)
    except Exception as e:
        emit('error', {'message': str(e)})

@socketio.on('riddles_buzz_in')
def handle_riddles_buzz_in(data):
    """Buzz in to answer riddle."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'riddles':
        return
    
    result = game_obj.buzz_in(player_name)
    
    if result['success']:
        emit('riddles_buzz_registered', {
            'player': result['player'],
            'message': result['message']
        }, room=game_id)
    else:
        emit('riddles_buzz_rejected', {'message': result['message']})

@socketio.on('submit_riddle_answer')
def handle_submit_riddle_answer(data):
    """Submit answer to riddle."""
    game_id = str(data.get('game_id'))
    player_name = session.get('player_name')
    answer = data.get('answer')
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'riddles':
        return
    
    result = game_obj.submit_answer(player_name, answer)
    
    if result['success']:
        emit('riddle_answer_result', {
            'correct': result['correct'],
            'answer': result.get('answer'),
            'points': result.get('points'),
            'message': result['message']
        }, room=game_id)
        emit_game_state(game_id)

@socketio.on('riddles_buzz_timeout')
def handle_riddles_buzz_timeout(data):
    """Handle buzz timeout."""
    game_id = str(data.get('game_id'))
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'riddles':
        return
    
    result = game_obj.buzz_timeout()
    
    if result['success']:
        emit('riddles_buzz_unlocked', {'message': result['message']}, room=game_id)

@socketio.on('skip_riddle')
def handle_skip_riddle(data):
    """Skip current riddle."""
    game_id = str(data.get('game_id'))
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'riddles':
        return
    
    result = game_obj.skip_riddle()
    
    if result['success']:
        emit('riddle_skipped', {
            'answer': result['answer'],
            'message': result['message']
        }, room=game_id)
        emit_game_state(game_id)

@socketio.on('next_riddle')
def handle_next_riddle(data):
    """Move to next riddle."""
    game_id = str(data.get('game_id'))
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'riddles':
        return
    
    result = game_obj.next_riddle()
    
    if result.get('game_ended'):
        emit('game_ended', {
            'message': result['message'],
            'scores': result['scores']
        }, room=game_id)
    else:
        emit('riddle_started', result, room=game_id)
        emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)}, room=game_id)
    
    emit_game_state(game_id)

@socketio.on('reveal_riddle_answer')
def handle_reveal_riddle_answer(data):
    """Reveal riddle answer."""
    game_id = str(data.get('game_id'))
    
    if game_id not in game_rooms:
        return
    
    game_obj = game_rooms[game_id]
    if game_obj.game_type != 'riddles':
        return
    
    result = game_obj.reveal_answer()
    
    if result['success']:
        emit('riddle_answer_revealed', {
            'answer': result['answer'],
            'message': result['message']
        }, room=game_id)
        emit_game_state(game_id)

# === End Riddles Events ===

@socketio.on('verify_game')
def handle_verify_game(data):
    gid = str(data.get('game_id'))
    pname = data.get('player_name')
    if gid in game_rooms:
        game_obj = game_rooms[gid]
        if any(p['name'] == pname for p in game_obj.players):
            join_room(gid)
            player_sids[pname] = request.sid
            emit_game_state(gid)
            if game_obj.game_type == 'trivia' and game_obj.status == 'round_active':
                # Start timer for the person who just joined/refreshed
                emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)})
                # Also ensure they have the latest question
                emit('new_question', game_obj.to_dict(include_answer=False).get('current_question'))
            elif game_obj.current_player == pname:
                if game_obj.game_type in ['charades', 'pictionary'] and game_obj.current_item: emit('new_item', game_obj.current_item)
            
            if game_obj.game_type == 'pictionary' and hasattr(game_obj, 'canvas_data'):
                emit('sync_canvas', game_obj.canvas_data)

@socketio.on('leave_game')
@socketio.on('host_withdraw')
def handle_leave(data):
    rid = str(data.get('roomId') or data.get('game_id'))
    pname = data.get('playerName') or session.get('player_name')
    if rid in game_rooms:
        game_obj = game_rooms[rid]
        game_obj.remove_player(pname)
        
        # If no players left, delete the room
        if not game_obj.players:
            # Cleanup data service cache for this room
            if hasattr(game_obj, 'data_service'):
                game_obj.data_service.cleanup_room(rid)
            del game_rooms[rid]
        # If only 1 player left, force close the room
        elif len(game_obj.players) == 1:
            logger.info(f"Only 1 player left in room {rid}, force closing room")
            emit('room_closed', {'message': 'اللاعب الآخر غادر، تم إغلاق الغرفة'}, room=rid)
            # Cleanup data service cache for this room
            if hasattr(game_obj, 'data_service'):
                game_obj.data_service.cleanup_room(rid)
            del game_rooms[rid]
        else:
            emit('player_left', {'message': f'{pname} غادر', 'players': game_obj.players}, room=rid)
            emit_game_state(rid)
        leave_room(rid)

@socketio.on('close_room')
def handle_close(data):
    room_id = str(data.get('roomId'))
    if room_id in game_rooms and game_rooms[room_id].host == session.get('player_name'):
        logger.info(f"Closing room {room_id}")
        # Cleanup data service cache for this room
        if hasattr(game_rooms[room_id], 'data_service'):
            game_rooms[room_id].data_service.cleanup_room(room_id)
        del game_rooms[room_id]
        socketio.emit('room_closed', {'message': 'تم إغلاق الغرفة من قبل المضيف'}, room=room_id)

def emit_game_state(gid):
    if gid in game_rooms:
        game_obj = game_rooms[gid]
        state = game_obj.to_dict(include_answer=False)
        emit('game_state', state, room=gid)

# Cleanup old room usage records on startup
try:
    DataManager().cleanup_old_room_usage(days=1)
    logger.info("Cleaned up old room usage records")
except Exception as e:
    logger.warning(f"Failed to cleanup old room usage: {e}")

if __name__ == '__main__':
    logger.info('='*50)
    logger.info('Family Games II Server Starting...')
    logger.info('Running on http://127.0.0.1:5005')
    logger.info('Press Ctrl+C to stop')
    logger.info('='*50)
    
    try:
        socketio.run(app, host='127.0.0.1', port=5005, debug=False)
    except KeyboardInterrupt:
        logger.info('\nShutting down server...')
        sys.exit(0)
