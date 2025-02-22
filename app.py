import eventlet
eventlet.monkey_patch()

from flask import Flask, redirect, render_template, session, request, copy_current_request_context, url_for, make_response, flash
from flask_socketio import SocketIO, emit, join_room, leave_room
import logging
import os
import json
import random
from datetime import datetime, timedelta
from game import CharadesGame
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

# Initialize SocketIO with proper configuration
socketio = SocketIO(
    app,
    manage_session=True,  # Enable session management
    cors_allowed_origins="*",
    async_mode='eventlet',
    ping_timeout=15000,
    ping_interval=25000,
    logger=True,
    engineio_logger=True,
    always_connect=True
)

# Game rooms storage
game_rooms = {}  # {room_id: CharadesGame}
game_state_transfer = {}  # Temporary storage for game state during transitions
player_sids = {}  # Map player names to their socket IDs

def get_player_sid(player_name):
    """Get socket ID for a player"""
    return player_sids.get(player_name)

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
    logger.debug(f"Session before connection: {session}")
    logger.debug(f"Is session permanent: {session.permanent}")
    logger.debug(f"Session contents before connection: {dict(session)}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/transfer_state/<transfer_id>')
def transfer_state(transfer_id):
    if transfer_id in game_state_transfer:
        state = game_state_transfer[transfer_id]
        del game_state_transfer[transfer_id]  # Clean up after use
        return state
    return {'error': 'State not found'}, 404

@app.route('/game/<game_id>')
def game_route(game_id):
    try:
        # Get transfer parameters
        player_name = request.args.get('player_name')
        transfer_id = request.args.get('transfer_id')
        
        if not player_name or not transfer_id:
            flash('جلسة اللعب غير صالحة أو منتهية الصلاحية')
            return redirect(url_for('index'))
        
        # Get game room
        game = game_rooms.get(game_id)
        if not game:
            flash('غرفة اللعب غير موجودة')
            return redirect(url_for('index'))
        
        # Validate player is in the game
        if not any(p['name'] == player_name for p in game.players):
            flash('اللاعب غير موجود في هذه الغرفة')
            return redirect(url_for('index'))
        
        is_host = session.get('is_host', False)
        return render_template('game.html',
                               game_id=game_id,
                               player_name=player_name,
                               is_host=is_host,
                               players=game.players)
                             
    except Exception as e:
        logger.error(f"Error accessing game route: {str(e)}")
        flash('حدث خطأ أثناء الدخول للعبة')
        return redirect(url_for('index'))

@socketio.on('connect')
def handle_connect():
    try:
        logger.debug(f"Client connected. Session: {session}")
        # Get player name from session instead of request args
        player_name = session.get('player_name')
        if player_name:
            player_sids[player_name] = request.sid
            logger.info(f"Assigned socket ID {request.sid} to player {player_name}")
        else:
            logger.warning("Player name not found in session")
    except Exception as e:
        logger.error(f"Error in handle_connect: {str(e)}")

@socketio.on('disconnect')
def handle_disconnect():
    try:
        # Remove player's socket ID when they disconnect
        if 'player_name' in session:
            player_sids.pop(session['player_name'], None)
            logger.info(f"Player disconnected: {session['player_name']}")
    except Exception as e:
        logger.error(f"Error in handle_disconnect: {str(e)}")

@socketio.on('create_game')
def handle_create_game(data):
    try:
        logger.info(f"Creating game: {data}")
        logger.debug(f"Session state before game creation: {session}")
        logger.debug(f"Session contents before game creation: {dict(session)}")
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
            
        logger.debug(f"Creating game for player: {player_name}")
        # Create game room using CharadesGame class
        game = CharadesGame(game_id, player_name)
        game_rooms[game_id] = game
        
        # Update session
        session['game_id'] = game_id
        session['is_host'] = True
        session['player_name'] = player_name
        session.modified = True
        
        logger.debug(f"Session after create: {dict(session)}")
        logger.debug(f"Game room after create: {game.to_dict()}")
        logger.debug(f"Player name set in session: {session.get('player_name')}")
        logger.debug(f"Session after creating game: {session}")
        logger.info(f"Game room {game_id} created by {player_name}")
        
        # Notify creator
        emit('game_created', {
            'game_id': game_id,
            'host': player_name,
            'players': game.players
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
            
        game = game_rooms[game_id]
        
        if game.status != 'waiting':
            raise ValueError("اللعبة بدأت بالفعل")
            
        # Update session before adding player
        session['game_id'] = game_id
        session['is_host'] = False
        session['player_name'] = player_name
        session.modified = True
        
        # Add player to game
        game.add_player(player_name)
        
        logger.debug(f"Session after join: {dict(session)}")
        logger.debug(f"Game room after join: {game.to_dict()}")
        logger.info(f"Player {player_name} joined game {game_id}")
        
        # Join socket room
        join_room(game_id)
        
        # Notify player of successful join
        emit('join_success', {
            'players': game.players,
            'host': game.host
        })
        
        # Notify other players
        emit('player_joined', {'players': game.players}, room=game_id)
        
        # Update player list for all clients
        emit('update_players', {'players': [p['name'] for p in game.players]}, room=game_id)
        
    except Exception as e:
        logger.error(f"Error joining game: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('start_game')
def handle_start_game(data):
    try:
        game_id = str(data.get('game_id'))
        logger.debug(f"Starting game {game_id}")
        game = game_rooms.get(game_id)
        
        if game:
            logger.debug(f"Number of players: {len(game.players)}")
            logger.debug(f"Players list: {[p['name'] for p in game.players]}")
            
            # Generate transfer ID for state preservation
            transfer_id = str(uuid.uuid4())
            
            # Emit game_started event with correct URL
            socketio.emit('game_started', {
                'game_id': game_id,
                'redirect_url': url_for('game_route', game_id=game_id),  # Use url_for to generate correct URL
                'transfer_id': transfer_id
            }, room=game_id)
            
            return True
    except Exception as e:
        logger.error(f"Error starting game: {str(e)}")
        return False

@socketio.on('guess_correct')
def handle_guess_correct(data):
    try:
        game_id = str(data.get('game_id'))
        guesser_name = data.get('player_name')
        
        if game_id not in game_rooms:
            raise ValueError("غرفة اللعب غير موجودة")
            
        game = game_rooms[game_id]
        if game.status != 'playing':
            raise ValueError("اللعبة لم تبدأ بعد")
            
        # Calculate scores
        points = calculate_score(game.round_start_time)
        current_player = game.current_player
        
        if points > 0:
            # Award points to both players
            game.scores[current_player] += points
            game.scores[guesser_name] += points
        
        # Move to next player
        current_idx = next((i for i, p in enumerate(game.players) if p['name'] == current_player), 0)
        next_idx = (current_idx + 1) % len(game.players)
        next_player = game.players[next_idx]['name']
        
        # Update game state
        game.current_player = next_player
        game.current_item = get_random_item()
        game.round_start_time = datetime.now()
        
        # Notify all players of the score update
        emit('score_update', {
            'scores': game.scores,
            'last_item': game.current_item
        }, room=game_id)
        
        # Send new word to next player
        emit('new_item', {
            'item': game.current_item
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
        if game.status != 'playing':
            raise ValueError("اللعبة لم تبدأ بعد")
            
        current_player = game.current_player
        
        # Deduct points for timeout
        game.scores[current_player] -= 5
        
        # Move to next player
        current_idx = next((i for i, p in enumerate(game.players) if p['name'] == current_player), 0)
        next_idx = (current_idx + 1) % len(game.players)
        next_player = game.players[next_idx]['name']
        
        # Update game state
        game.current_player = next_player
        game.current_item = get_random_item()
        game.round_start_time = datetime.now()
        
        # Notify all players
        emit('round_ended', {
            'scores': game.scores,
            'last_item': game.current_item,
            'timeout': True
        }, room=game_id)
        
        # Send new word to next player
        emit('new_item', {
            'item': game.current_item
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
                game = game_rooms[game_id]
                game.remove_player(session.get('player_name'))
                logger.info(f"Player {session.get('player_name')} left game {game_id}")
                emit('player_joined', {'players': game.players}, room=game_id)
                
            leave_room(game_id)
            session.pop('game_id', None)
            session.pop('player_name', None)
            session.pop('is_host', None)
            
            logger.debug(f"Session after cancel: {dict(session)}")
            
    except Exception as e:
        logger.error(f"Error cancelling game: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('leave_game')
def handle_leave_game(data):
    try:
        room_id = str(data.get('roomId'))
        player_name = data.get('playerName')
        
        if room_id in game_rooms:
            # Debug log before removal
            logger.debug(f"Game room state before leave: {game_rooms[room_id].to_dict()}")
            
            # Remove player from the game room's player list
            game = game_rooms[room_id]
            game.remove_player(player_name)
            
            # Debug log after removal
            logger.debug(f"Game room state after leave: {game.to_dict()}")
            
            # Get the updated player list
            players = [p['name'] for p in game.players]
            
            # Emit update_players event to all clients in the room
            emit('update_players', {'players': players}, room=room_id)
            
            # Emit player_left event with updated player list
            emit('player_left', {
                'message': f"{player_name} خرج من اللعبة",
                'players': game.players
            }, room=room_id)
            
            logger.info(f"Player {player_name} disconnected from game {room_id}")
            
            # Leave the room
            leave_room(room_id)
            
            # Clear session if this player is leaving
            if session.get('player_name') == player_name:
                session.pop('game_id', None)
                session.pop('is_host', None)
                session.pop('player_name', None)
                
            logger.debug(f"Session after disconnect: {session}")
            
    except Exception as e:
        logger.error(f"Error in handle_leave_game: {str(e)}")

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
        game = game_rooms[game_id]
        players = [p['name'] for p in game.players]
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
        game = game_rooms[game_id]
        players = [p['name'] for p in game.players]
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
        game = game_rooms[game_id]
        if game.host != player_name:
            raise ValueError("فقط اللعيب الكبير يقدر يبدأ الجولة")
        
        # Start next round
        emit('game_state', {
            'message': "بدأت جولة جديدة",
            'round': game.round + 1
        }, room=game_id)
        
        game.round += 1
        
    except Exception as e:
        logger.error(f"Error starting next round: {str(e)}")
        emit('game_error', {'message': str(e)})

def check_disconnected_players():
    while True:
        current_time = time.time()
        for game_id in list(game_rooms.keys()):
            game = game_rooms.get(game_id)
            if not game:
                continue
                
            # Check host timeout
            host_disconnect_time = game.get('host_disconnect_time')
            if host_disconnect_time and (current_time - host_disconnect_time) > HOST_TIMEOUT:
                del game_rooms[game_id]
                continue
                
            # Check player timeouts
            player_disconnect_times = game.get('player_disconnect_times', {})
            for player_name, disconnect_time in list(player_disconnect_times.items()):
                if (current_time - disconnect_time) > PLAYER_TIMEOUT:
                    # Remove player after grace period
                    game['players'] = [p for p in game['players'] if p['name'] != player_name]
                    del player_disconnect_times[player_name]
                    socketio.emit('player_left', {'player_name': player_name}, room=game_id)
                    logger.info(f"Player {player_name} disconnected from game {game_id}")
        
        time.sleep(1)  # Check every second

if __name__ == '__main__':
    try:
        logger.info("Starting server...")
        # Run the app with SocketIO
        socketio.run(app, host='127.0.0.1', port=5000, debug=True)
    except Exception as e:
        logger.error(f"Error starting server: {str(e)}")
        raise
