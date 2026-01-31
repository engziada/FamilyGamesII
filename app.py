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
from dotenv import load_dotenv
from typing import Dict, List, Optional, Callable
from services.timer_manager import TimerManager

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

# Constants
TURN_TIMEOUT_SECONDS = 30
HINT_DELAYS = [30, 60, 90]
TRIVIA_RESULT_DELAY = 2
MIN_PLAYERS = 2
MAX_PLAYERS = 8
DEFAULT_AVATAR = '🐶'
REACTION_COOLDOWN = 1.5

# Game rooms storage
game_rooms = {}
player_sids: Dict[str, List[str]] = {}  # Store list of SIDs per player for multi-connection
timer_manager = TimerManager()
reaction_timestamps: Dict[str, float] = {}

def get_player_sid(player_name: str) -> Optional[str]:
    """Get the most recent socket ID for a player.
    
    Args:
        player_name: Name of the player
        
    Returns:
        Most recent socket ID or None if player not found
    """
    sids = player_sids.get(player_name, [])
    return sids[-1] if sids else None

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
    """Handle new socket connection and store player SID."""
    player_name = session.get('player_name')
    if player_name:
        # Migration: Convert old string SIDs to list format
        if player_name not in player_sids:
            player_sids[player_name] = []
        elif isinstance(player_sids[player_name], str):
            # Convert old string format to list
            player_sids[player_name] = [player_sids[player_name]]
        
        player_sids[player_name].append(request.sid)
        logger.debug(f"Player {player_name} connected with SID {request.sid}")

@socketio.on('create_game')
def handle_create_game(data):
    try:
        game_id = str(data.get('game_id'))
        player_name = data.get('player_name')
        avatar = data.get('avatar', '🐶')
        game_type = data.get('game_type')
        settings = data.get('settings', {})
        
        if not game_id or not player_name:
            raise ValueError("معلومات ناقصة")
            
        if game_type == 'trivia':
            game_obj = TriviaGame(game_id, player_name, settings, avatar=avatar)
        elif game_type == 'pictionary':
            game_obj = PictionaryGame(game_id, player_name, settings, avatar=avatar)
        else:
            game_obj = CharadesGame(game_id, player_name, settings, avatar=avatar)
            
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
        avatar = data.get('avatar', '🐶')
        if game_id not in game_rooms: raise ValueError("الغرفة غير موجودة")
        game_obj = game_rooms[game_id]
        game_obj.add_player(player_name, avatar=avatar)
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
    """Handle game start and initialize timers."""
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
            
            # Start turn timer for non-trivia games
            if game_obj.game_type != 'trivia':
                timer_manager.start_turn_timer(
                    game_id, 
                    game_obj.current_player, 
                    auto_skip_player, 
                    TURN_TIMEOUT_SECONDS
                )
    except Exception as e:
        logger.error(f"Error starting game: {e}")
        emit('error', {'message': str(e)})

@socketio.on('player_ready')
def handle_player_ready(data):
    """Handle player ready signal and start round timer."""
    game_id = str(data.get('game_id'))
    game_obj = game_rooms.get(game_id)
    player_name = session.get('player_name')
    
    if game_obj and game_obj.game_type != 'trivia' and game_obj.current_player == player_name:
        # Cancel turn timer since player is ready
        timer_manager.cancel_turn_timer(game_id)
        
        game_obj.status = 'round_active'
        if hasattr(game_obj, 'start_round_timer'): 
            game_obj.start_round_timer()
        
        # Start hint cycle for pictionary
        if game_obj.game_type == 'pictionary':
            timer_manager.start_hint_cycle(game_id, send_hint, HINT_DELAYS)
        
        emit('force_reset_timer', {'current_player': game_obj.current_player, 'game_status': game_obj.status}, room=game_obj.game_id)
        limit = game_obj.settings.get('time_limit', 90)
        emit('timer_start', {'duration': limit}, room=game_obj.game_id)
        emit_game_state(game_id)

@socketio.on('guess_correct')
def handle_guess_correct(data):
    """Handle correct guess and update scores."""
    game_id = str(data.get('game_id'))
    game_obj = game_rooms.get(game_id)
    guesser = data.get('player_name')
    
    if game_obj and game_obj.game_type in ['charades', 'pictionary']:
        points = CharadesGame.calculate_score(game_obj.round_start_time)
        if points > 0:
            game_obj.add_score(game_obj.current_player, points)
            game_obj.add_score(guesser, points)
            
            # Fix Bug #4: Only add points once if same team
            if game_obj.settings.get('teams'):
                p1 = next((p for p in game_obj.players if p['name'] == game_obj.current_player), None)
                p2 = next((p for p in game_obj.players if p['name'] == guesser), None)
                
                if p1 and p2:
                    if p1['team'] == p2['team']:
                        # Same team - add points once
                        game_obj.team_scores[str(p1['team'])] += points
                    else:
                        # Different teams - add points to both
                        game_obj.team_scores[str(p1['team'])] += points
                        game_obj.team_scores[str(p2['team'])] += points

        # Cancel hint timers
        timer_manager.cancel_hint_timers(game_id)
        
        game_obj.next_round(game_obj.get_item())
        game_obj.status = 'playing'
        
        # Start turn timer for next player
        timer_manager.start_turn_timer(game_id, game_obj.current_player, auto_skip_player, TURN_TIMEOUT_SECONDS)
        
        emit('correct_guess', {'guesser': guesser, 'performer': game_obj.current_player}, room=game_obj.game_id)
        emit('force_reset_timer', {'next_player': game_obj.current_player, 'game_status': game_obj.status}, room=game_obj.game_id)
        
        if game_obj.game_type == 'pictionary':
            game_obj.clear_canvas()
            emit('clear_canvas', room=game_obj.game_id)
            
        emit_game_state(game_obj.game_id)
        sid = get_player_sid(game_obj.current_player)
        if sid: socketio.emit('new_item', game_obj.current_item, to=sid)

@socketio.on('submit_answer')
def handle_submit_answer(data):
    """Handle trivia answer submission."""
    game_id = str(data.get('game_id'))
    game_obj = game_rooms.get(game_id)
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

            # Fix Bug #8: Use async spawn_after instead of blocking sleep
            def delayed_next_round():
                if game_id in game_rooms:
                    game_obj.next_round()
                    socketio.emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)}, room=game_id)
                    emit_game_state(game_id)
            
            eventlet.spawn_after(TRIVIA_RESULT_DELAY, delayed_next_round)
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
                
                # Fix Bug #8: Use async spawn_after instead of blocking sleep
                def delayed_all_wrong():
                    if game_id in game_rooms:
                        game_obj.next_round()
                        socketio.emit('all_wrong', {'message': 'كل اللاعبين جاوبوا غلط! السؤال التالي...'}, room=game_id)
                        socketio.emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)}, room=game_id)
                        emit_game_state(game_id)
                
                eventlet.spawn_after(TRIVIA_RESULT_DELAY, delayed_all_wrong)

@socketio.on('round_timeout')
def handle_round_timeout(data):
    """Handle round timeout and move to next round."""
    game_id = str(data.get('game_id'))
    game_obj = game_rooms.get(game_id)
    
    if game_obj:
        if game_obj.game_type in ['charades', 'pictionary']:
            # Cancel hint timers
            timer_manager.cancel_hint_timers(game_id)
            
            emit('reveal_item', game_obj.current_item, room=game_obj.game_id)
            game_obj.next_round(game_obj.get_item())
            game_obj.status = 'playing'
            
            # Start turn timer for next player
            timer_manager.start_turn_timer(game_id, game_obj.current_player, auto_skip_player, TURN_TIMEOUT_SECONDS)
            
            emit('round_timeout', {'next_player': game_obj.current_player, 'game_status': game_obj.status}, room=game_obj.game_id)
            sid = get_player_sid(game_obj.current_player)
            if sid: socketio.emit('new_item', game_obj.current_item, to=sid)
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
    """Handle turn skip and move to next player."""
    if game_obj.game_type in ['charades', 'pictionary']:
        # Cancel hint timers
        timer_manager.cancel_hint_timers(game_obj.game_id)
        
        emit('reveal_item', game_obj.current_item, room=game_obj.game_id)
        item = game_obj.get_item()
        game_obj.next_round(item)
        game_obj.status = 'playing'
        
        # Start turn timer for next player
        timer_manager.start_turn_timer(game_obj.game_id, game_obj.current_player, auto_skip_player, TURN_TIMEOUT_SECONDS)
        
        emit('pass_turn', {'player': skipper_name, 'next_player': game_obj.current_player, 'game_status': game_obj.status}, room=game_obj.game_id)
        if game_obj.game_type == 'pictionary':
            game_obj.clear_canvas()
            emit('clear_canvas', room=game_obj.game_id)
        sid = get_player_sid(game_obj.current_player)
        if sid: socketio.emit('new_item', game_obj.current_item, to=sid)
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
            if game_obj.game_type == 'trivia' and game_obj.status == 'round_active':
                # Start timer for the person who just joined/refreshed
                emit('timer_start', {'duration': game_obj.settings.get('time_limit', 30)})
                # Also ensure they have the latest question
                emit('new_question', game_obj.to_dict(include_answer=False).get('current_question'))
            elif game_obj.current_player == pname:
                if game_obj.game_type in ['charades', 'pictionary'] and game_obj.current_item: socketio.emit('new_item', game_obj.current_item, to=request.sid)
            
            if game_obj.game_type == 'pictionary' and hasattr(game_obj, 'canvas_data'):
                emit('sync_canvas', game_obj.canvas_data)

@socketio.on('leave_game')
@socketio.on('host_withdraw')
def handle_leave(data):
    """Handle player leaving game with proper cleanup."""
    rid = str(data.get('roomId') or data.get('game_id'))
    pname = data.get('playerName') or session.get('player_name')
    
    if rid in game_rooms:
        game_obj = game_rooms[rid]
        game_obj.remove_player(pname)
        
        # Fix Bug #5: Clean up session data
        session.pop('game_id', None)
        session.pop('player_name', None)
        session.pop('is_host', None)
        
        # Fix Bug #5: Clean up player SID
        player_sids.pop(pname, None)
        
        # If no players left, delete the room
        if not game_obj.players:
            cleanup_room(rid)
        # If only 1 player left, force close the room
        elif len(game_obj.players) == 1:
            logger.info(f"Only 1 player left in room {rid}, force closing room")
            emit('room_closed', {'message': 'اللاعب الآخر غادر، تم إغلاق الغرفة'}, room=rid)
            cleanup_room(rid)
        else:
            emit('player_left', {'message': f'{pname} غادر', 'players': game_obj.players}, room=rid)
            emit_game_state(rid)
        leave_room(rid)

@socketio.on('finish_game')
def handle_finish_game(data):
    game_id = str(data.get('game_id'))
    game_obj = game_rooms.get(game_id)
    if game_obj and game_obj.host == session.get('player_name'):
        # Sort players by score
        sorted_players = sorted(game_obj.players, key=lambda p: game_obj.scores.get(p['name'], 0), reverse=True)

        # Determine highlights
        highlights = []
        if sorted_players:
            winner = sorted_players[0]['name']
            highlights.append({'title': '👑 الملك', 'player': winner, 'desc': 'أعلى سكور في اللعبة'})

        summary_data = {
            'scores': game_obj.scores,
            'team_scores': game_obj.team_scores,
            'players': game_obj.players,
            'highlights': highlights
        }
        emit('game_ended', summary_data, room=game_id)

@socketio.on('player_reaction')
def handle_reaction(data):
    game_id = str(data.get('game_id'))
    reaction = data.get('reaction')
    player_name = session.get('player_name')
    if game_id and reaction:
        emit('new_reaction', {'player': player_name, 'reaction': reaction}, room=game_id)

@socketio.on('close_room')
def handle_close(data):
    """Handle room closure by host."""
    room_id = str(data.get('roomId'))
    if room_id in game_rooms and game_rooms[room_id].host == session.get('player_name'):
        logger.info(f"Closing room {room_id}")
        cleanup_room(room_id)
        socketio.emit('room_closed', {'message': 'تم إغلاق الغرفة من قبل المضيف'}, room=room_id)

def auto_skip_player(game_id: str, player_name: str) -> None:
    """
    Auto-skip inactive player after timeout.
    
    Args:
        game_id: Game room identifier
        player_name: Name of the player to skip
    """
    game_obj = game_rooms.get(game_id)
    if game_obj and game_obj.current_player == player_name and game_obj.status == 'playing':
        logger.info(f"Auto-skipping inactive player {player_name} in room {game_id}")
        handle_turn_skip(game_obj, f"النظام (عدم استجابة {player_name})")
        socketio.emit('player_inactive', {'player': player_name}, room=game_id)

def send_hint(game_id: str, hint_number: int) -> None:
    """
    Send hint to players during pictionary game.
    
    Args:
        game_id: Game room identifier
        hint_number: Hint number (1, 2, or 3)
    """
    game_obj = game_rooms.get(game_id)
    if game_obj and game_obj.status == 'round_active' and not getattr(game_obj, 'paused', False):
        hint = game_obj.get_hint(hint_number)
        if hint:
            logger.info(f"Sending hint {hint_number} for game {game_id}")
            socketio.emit('new_hint', {'hint': hint, 'number': hint_number}, room=game_id)

def cleanup_room(room_id: str) -> None:
    """
    Clean up all resources for a game room.
    
    Args:
        room_id: Game room identifier
    """
    if room_id in game_rooms:
        game_obj = game_rooms[room_id]
        
        # Clean up data service cache
        if hasattr(game_obj, 'data_service'):
            game_obj.data_service.cleanup_room(room_id)
        
        # Clean up timers
        timer_manager.cleanup_game_timers(room_id)
        
        # Clean up player SIDs for this room
        for player in game_obj.players:
            player_sids.pop(player['name'], None)
        
        # Remove room
        del game_rooms[room_id]
        
        logger.info(f"Room {room_id} cleaned up successfully")

def emit_game_state(gid: str) -> None:
    """
    Emit current game state to all players in room.
    
    Args:
        gid: Game room identifier
    """
    if gid in game_rooms:
        game_obj = game_rooms[gid]
        state = game_obj.to_dict(include_answer=False)
        emit('game_state', state, room=gid)

if __name__ == '__main__':
    socketio.run(app, host='127.0.0.1', port=5000, debug=True)
