from flask import Flask, redirect, render_template, session, request, copy_current_request_context, url_for, make_response
from flask_socketio import SocketIO, emit, join_room, leave_room
import logging
import os
import json
import random
from datetime import datetime, timedelta

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

# Initialize SocketIO
socketio = SocketIO(app, manage_session=False)

# Game rooms storage
game_rooms = {}  # {room_id: {host: str, players: list, game_type: str, status: str, scores: dict, current_player: str, current_item: str, round_start_time: datetime}}

def load_charades_items():
    with open('static/data/charades_items.json', 'r', encoding='utf-8') as f:
        return json.load(f)['items']

def get_random_item():
    items = load_charades_items()
    return random.choice(items)

def calculate_score(start_time):
    elapsed_seconds = (datetime.now() - start_time).total_seconds()
    if elapsed_seconds <= 60:  # First minute
        return 10
    elif elapsed_seconds <= 120:  # Second minute
        return 5
    return 0

@app.before_request
def make_session_permanent():
    session.permanent = True

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/game/<game_id>')
def game(game_id):
    logger.debug(f"Accessing game route with game_id: {game_id}")
    logger.debug(f"Current session: {dict(session)}")
    logger.debug(f"Available game rooms: {list(game_rooms.keys())}")
    
    # Get game data from URL parameters if session is empty or mismatched
    if 'game_id' not in session or session['game_id'] != game_id:
        player_name = request.args.get('player_name')
        is_host = request.args.get('is_host', 'false').lower() == 'true'
        
        if game_id and player_name:
            logger.debug(f"Updating session from URL parameters: game_id={game_id}, player_name={player_name}, is_host={is_host}")
            session['game_id'] = game_id
            session['player_name'] = player_name
            session['is_host'] = is_host
            session.modified = True
    
    if game_id not in game_rooms:
        logger.warning(f"Game {game_id} not found in game_rooms")
        return redirect(url_for('index'))
    
    player_name = session.get('player_name')
    is_host = session.get('is_host', False)
    
    # Verify player is in the game
    if not any(p['name'] == player_name for p in game_rooms[game_id]['players']):
        logger.warning(f"Player {player_name} not found in game {game_id}")
        return redirect(url_for('index'))
    
    logger.info(f"Rendering game page for {player_name} (host: {is_host}) in game {game_id}")
    
    # Get initial player list
    players = [p['name'] for p in game_rooms[game_id]['players']]
    logger.debug(f"Initial player list for game {game_id}: {players}")
    
    # Create response with template
    response = make_response(render_template('game.html', 
        game_id=game_id,
        player_name=player_name,
        is_host=is_host,
        game_type=game_rooms[game_id]['game_type'],
        players=players,  # Pass initial player list
        game_rooms=game_rooms
    ))
    
    # Set session cookie explicitly
    response.set_cookie('game_session', session.sid if hasattr(session, 'sid') else '', httponly=True, samesite='Lax')
    return response

@socketio.on('connect')
def handle_connect():
    logger.debug(f"Client connected. Session: {dict(session)}")

@socketio.on('create_game')
def handle_create_game(data):
    try:
        game_id = str(data.get('game_id'))
        player_name = data.get('player_name')
        game_type = data.get('game_type')
        
        logger.debug(f"Create game request - Game ID: {game_id}")
        logger.debug(f"Create game request - Player Name: {player_name}")
        logger.debug(f"Create game request - Game Type: {game_type}")
        
        if not game_id or not player_name:
            raise ValueError("معلومات اللعبة غير كاملة")
            
        if game_id in game_rooms:
            raise ValueError("رقم الأوضة موجود بالفعل")
            
        # Create game room
        game_rooms[game_id] = {
            'host': player_name,
            'players': [{'name': player_name, 'isHost': True}],
            'game_type': game_type,
            'status': 'waiting',
            'scores': {},
            'current_player': '',
            'current_item': '',
            'round_start_time': None
        }
        
        # Update session
        session['game_id'] = game_id
        session['is_host'] = True
        session['player_name'] = player_name
        session.modified = True
        
        logger.debug(f"Session after create: {dict(session)}")
        logger.debug(f"Game room after create: {game_rooms[game_id]}")
        logger.info(f"Game room {game_id} created by {player_name}")
        
        # Notify creator
        emit('game_created', {
            'game_id': game_id,
            'host': player_name,
            'players': game_rooms[game_id]['players']
        })
        
        join_room(game_id)
        
    except Exception as e:
        logger.error(f"Error creating game: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('join_game')
def handle_join_game(data):
    try:
        game_id = str(data['game_id'])
        player_name = data['player_name']
        
        if game_id not in game_rooms:
            raise ValueError("غرفة اللعب غير موجودة")
            
        if game_rooms[game_id]['status'] != 'waiting':
            raise ValueError("اللعبة بدأت بالفعل")
            
        # Check max players
        if len(game_rooms[game_id]['players']) >= 8:
            raise ValueError("غرفة اللعب ممتلئة")
            
        # Check if player already exists
        if any(p['name'] == player_name for p in game_rooms[game_id]['players']):
            raise ValueError("اسم اللاعب موجود بالفعل في الغرفة")
            
        # Add player to room
        game_rooms[game_id]['players'].append({
            'name': player_name,
            'isHost': False
        })
        
        # Set session data
        session['player_name'] = player_name
        session['game_id'] = game_id
        session['is_host'] = False
        session.modified = True
        
        logger.debug(f"Session after join: {dict(session)}")
        logger.debug(f"Game room after join: {game_rooms[game_id]}")
        
        # Join socket room
        join_room(game_id)
        logger.info(f"Player {player_name} joined game {game_id}")
        
        # Get list of player names
        players = [p['name'] for p in game_rooms[game_id]['players']]
        
        # Send room info to the joining player
        emit('join_success', {
            'players': game_rooms[game_id]['players'],
            'host': game_rooms[game_id]['host']
        })
        
        # Notify all other players in room
        emit('player_joined', {
            'players': game_rooms[game_id]['players']
        }, room=game_id)
        
        # Send updated player list
        emit('update_players', {
            'players': players
        }, room=game_id)
        
    except Exception as e:
        logger.error(f"Error joining game: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('start_game')
def handle_start_game(data):
    try:
        game_id = str(data.get('game_id'))
        player_name = data.get('player_name')
        
        logger.debug(f"Start game request - Game ID: {game_id}")
        logger.debug(f"Start game request - Player Name: {player_name}")
        
        if not game_id or game_id not in game_rooms:
            raise ValueError("غرفة اللعب غير موجودة")
            
        # Check if player is the host
        game_host = game_rooms[game_id]['host']
        if not player_name or game_host != player_name:
            logger.debug(f"Host check failed - Expected host: {game_host}, Got player: {player_name}")
            raise ValueError("فقط مضيف اللعبة يمكنه بدء اللعبة")
            
        if len(game_rooms[game_id]['players']) < 2:
            raise ValueError("محتاج على الأقل لعيبين للعب")
        
        # Initialize game state
        game_rooms[game_id]['status'] = 'playing'
        game_rooms[game_id]['scores'] = {p['name']: 0 for p in game_rooms[game_id]['players']}
        game_rooms[game_id]['current_player'] = player_name
        game_rooms[game_id]['current_item'] = get_random_item()
        game_rooms[game_id]['round_start_time'] = datetime.now()
        
        logger.info(f"Game {game_id} started by host {player_name}")
        
        # Notify all players about game start
        emit('game_started', {
            'game_id': game_id,
            'current_player': player_name,
            'scores': game_rooms[game_id]['scores']
        }, room=game_id)
        
        # Send the word only to the current player
        emit('new_item', {
            'item': game_rooms[game_id]['current_item']
        }, room=request.sid)
        
        # Start the timer for all players
        emit('timer_start', {
            'duration': 120  # 2 minutes in seconds
        }, room=game_id)
        
    except Exception as e:
        logger.error(f"Error starting game: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('guess_correct')
def handle_guess_correct(data):
    try:
        game_id = str(data.get('game_id'))
        guesser_name = data.get('player_name')
        
        if game_id not in game_rooms:
            raise ValueError("غرفة اللعب غير موجودة")
            
        game = game_rooms[game_id]
        if game['status'] != 'playing':
            raise ValueError("اللعبة لم تبدأ بعد")
            
        # Calculate scores
        points = calculate_score(game['round_start_time'])
        current_player = game['current_player']
        
        if points > 0:
            # Award points to both players
            game['scores'][current_player] += points
            game['scores'][guesser_name] += points
        
        # Move to next player
        current_idx = next((i for i, p in enumerate(game['players']) if p['name'] == current_player), 0)
        next_idx = (current_idx + 1) % len(game['players'])
        next_player = game['players'][next_idx]['name']
        
        # Update game state
        game['current_player'] = next_player
        game['current_item'] = get_random_item()
        game['round_start_time'] = datetime.now()
        
        # Notify all players of the score update
        emit('score_update', {
            'scores': game['scores'],
            'last_item': game['current_item']
        }, room=game_id)
        
        # Send new word to next player
        emit('new_item', {
            'item': game['current_item']
        }, room=next_player)
        
        # Start new timer
        emit('timer_start', {
            'duration': 120
        }, room=game_id)
        
    except Exception as e:
        logger.error(f"Error handling correct guess: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('round_timeout')
def handle_round_timeout(data):
    try:
        game_id = str(data.get('game_id'))
        
        if game_id not in game_rooms:
            raise ValueError("غرفة اللعب غير موجودة")
            
        game = game_rooms[game_id]
        if game['status'] != 'playing':
            raise ValueError("اللعبة لم تبدأ بعد")
            
        current_player = game['current_player']
        
        # Deduct points for timeout
        game['scores'][current_player] -= 5
        
        # Move to next player
        current_idx = next((i for i, p in enumerate(game['players']) if p['name'] == current_player), 0)
        next_idx = (current_idx + 1) % len(game['players'])
        next_player = game['players'][next_idx]['name']
        
        # Update game state
        game['current_player'] = next_player
        game['current_item'] = get_random_item()
        game['round_start_time'] = datetime.now()
        
        # Notify all players
        emit('round_ended', {
            'scores': game['scores'],
            'last_item': game['current_item'],
            'timeout': True
        }, room=game_id)
        
        # Send new word to next player
        emit('new_item', {
            'item': game['current_item']
        }, room=next_player)
        
        # Start new timer
        emit('timer_start', {
            'duration': 120
        }, room=game_id)
        
    except Exception as e:
        logger.error(f"Error handling round timeout: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('cancel_game')
def handle_cancel_game():
    try:
        game_id = session.get('game_id')
        if game_id and game_id in game_rooms:
            if session.get('is_host'):
                # Remove game room
                del game_rooms[game_id]
                logger.info(f"Game {game_id} cancelled by host")
                emit('game_cancelled', room=game_id)
            else:
                # Remove player from room
                players = game_rooms[game_id]['players']
                players[:] = [p for p in players if p['name'] != session.get('player_name')]
                logger.info(f"Player {session.get('player_name')} left game {game_id}")
                emit('player_joined', {'players': players}, room=game_id)
                
            leave_room(game_id)
            session.pop('game_id', None)
            session.pop('player_name', None)
            session.pop('is_host', None)
            
            logger.debug(f"Session after cancel: {dict(session)}")
            
    except Exception as e:
        logger.error(f"Error cancelling game: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('disconnect')
def handle_disconnect():
    try:
        game_id = session.get('game_id')
        if game_id and game_id in game_rooms:
            if session.get('is_host'):
                # Remove game room if host disconnects
                del game_rooms[game_id]
                logger.info(f"Game {game_id} ended - host disconnected")
                emit('game_ended', {'message': 'اللعيب الكبير خرج من اللعبة'}, room=game_id)
            else:
                # Remove player from room
                players = game_rooms[game_id]['players']
                players[:] = [p for p in players if p['name'] != session.get('player_name')]
                logger.info(f"Player {session.get('player_name')} disconnected from game {game_id}")
                
                # Get list of player names and emit update
                player_names = [p['name'] for p in players]
                emit('update_players', {
                    'players': player_names
                }, room=game_id)
                
                # Notify remaining players
                emit('player_left', {
                    'message': f"{session.get('player_name')} خرج من اللعبة",
                    'players': players
                }, room=game_id)
                
            leave_room(game_id)
            
            logger.debug(f"Session after disconnect: {dict(session)}")
            
    except Exception as e:
        logger.error(f"Error handling disconnect: {str(e)}")

@socketio.on('join_game_room')
def handle_join_game_room(data):
    try:
        game_id = str(data['game_id'])
        player_name = session.get('player_name')
        
        logger.debug(f"Received join_game_room event - game_id: {game_id}, player_name: {player_name}")
        
        if not game_id or game_id not in game_rooms:
            logger.error(f"Game {game_id} not found in game_rooms")
            raise ValueError("غرفة اللعب غير موجودة")
        
        # Join the game room
        join_room(game_id)
        logger.info(f"Player {player_name} joined game room {game_id}")
        
        # Get list of player names
        players = [p['name'] for p in game_rooms[game_id]['players']]
        logger.debug(f"Current players in room {game_id}: {players}")
        
        # Send game state and player list updates
        emit('game_state', {
            'message': f"{player_name} انضم للعبة",
            'players': players  # Send only player names
        }, room=game_id)
        
    except Exception as e:
        logger.error(f"Error joining game room: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('request_players')
def handle_request_players(data):
    try:
        game_id = str(data['game_id'])
        logger.debug(f"Received request_players event for game {game_id}")
        
        if game_id not in game_rooms:
            logger.error(f"Game {game_id} not found in game_rooms")
            raise ValueError("غرفة اللعب غير موجودة")
            
        # Get list of player names
        players = [p['name'] for p in game_rooms[game_id]['players']]
        logger.debug(f"Sending player list for game {game_id}: {players}")
        
        # Send game state with player list
        emit('game_state', {
            'players': players,
            'message': 'تم تحديث قائمة اللاعبين'
        }, room=game_id)
        
    except Exception as e:
        logger.error(f"Error handling request_players: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('next_round')
def handle_next_round(data):
    try:
        game_id = str(data['game_id'])
        player_name = session.get('player_name')
        
        if not game_id or game_id not in game_rooms:
            raise ValueError("غرفة اللعب غير موجودة")
        
        # Verify player is host
        if game_rooms[game_id]['host'] != player_name:
            raise ValueError("فقط اللعيب الكبير يقدر يبدأ الجولة")
        
        # Start next round
        emit('game_state', {
            'message': "بدأت جولة جديدة",
            'round': game_rooms[game_id].get('round', 0) + 1
        }, room=game_id)
        
        game_rooms[game_id]['round'] = game_rooms[game_id].get('round', 0) + 1
        
    except Exception as e:
        logger.error(f"Error starting next round: {str(e)}")
        emit('game_error', {'message': str(e)})

if __name__ == '__main__':
    socketio.run(app, debug=True)