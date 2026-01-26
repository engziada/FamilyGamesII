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
import time
import uuid

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
app.config['SECRET_KEY'] = 'your-secret-key-123'
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
            
        if game_type == 'trivia':
            game_obj = TriviaGame(game_id, player_name, settings)
        elif game_type == 'pictionary':
            game_obj = PictionaryGame(game_id, player_name, settings)
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
            elif game_obj.game_type == 'trivia':
                game_obj.current_question = game_obj.get_random_question()
            
            emit('game_started', {
                'game_id': game_id,
                'redirect_url': f'/game/{game_id}',
                'transfer_id': str(uuid.uuid4())
            }, room=game_id)
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
            # Individual feedback for wrong answer
            emit('answer_result', {
                'player': player_name,
                'is_correct': False,
                'correct_answer': None # Don't reveal yet
            })

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
            if game_obj.game_type == 'trivia':
                # Questions are shared in state, but we might want to start timer for late joiners?
                pass
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
        if not game_obj.players: del game_rooms[rid]
        else:
            emit('player_left', {'message': f'{pname} غادر', 'players': game_obj.players}, room=rid)
            emit_game_state(rid)
        leave_room(rid)

@socketio.on('close_room')
def handle_close(data):
    room_id = str(data.get('roomId'))
    if room_id in game_rooms and game_rooms[room_id].host == session.get('player_name'):
        logger.info(f"Closing room {room_id}")
        del game_rooms[room_id]
        socketio.emit('room_closed', {'message': 'تم إغلاق الغرفة من قبل المضيف'}, room=room_id)

def emit_game_state(gid):
    if gid in game_rooms:
        game_obj = game_rooms[gid]
        state = game_obj.to_dict(include_answer=False)
        emit('game_state', state, room=gid)

if __name__ == '__main__':
    socketio.run(app, host='127.0.0.1', port=5000, debug=True)
