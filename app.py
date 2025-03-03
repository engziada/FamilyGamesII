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
transfer_states = {}  # Store transfer states for persistence

def get_player_sid(player_name):
    """Get socket ID for a player"""
    return player_sids.get(player_name)

def load_charades_items():
    with open('static/data/charades_items.json', 'r', encoding='utf-8') as f:
        return json.load(f)

def get_random_item():
    """Get a random item from the charades items list"""
    items = load_charades_items()
    if not items:
        return None
    
    random_item = random.choice(items['items'])
    return {
        'item': random_item['name'],
        'category': random_item['category']
    }

def calculate_score(start_time):
    """Calculate score based on elapsed time since round start"""
    if start_time is None:
        logger.warning("Cannot calculate score: start_time is None")
        return 0
        
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
def game(game_id):
    """Game page route."""
    try:
        game_id = str(game_id)
        if game_id not in game_rooms:
            flash('غرفة اللعب غير موجودة', 'error')
            return redirect(url_for('index'))
            
        game = game_rooms[game_id]
        player_name = request.args.get('player_name') or session.get('player_name')
        transfer_id = request.args.get('transfer_id')
        
        logger.debug(f"Game route - game_id: {game_id}, player_name: {player_name}, transfer_id: {transfer_id}")
        
        # Ensure player info exists
        if not player_name:
            flash('لم يتم العثور على اسم اللاعب', 'error')
            return redirect(url_for('index'))
        
        # Check if player is in the game
        if not any(p['name'] == player_name for p in game.players):
            flash('انت مش في اللعبة دي', 'error')
            return redirect(url_for('index'))
            
        # Update session with current game info
        session['game_id'] = game_id
        session['player_name'] = player_name
        # Check if player is host
        is_host = False
        if game.host == player_name:  # Check host property
            is_host = True
        else:  # Check isHost flag in players list
            for player in game.players:
                if player['name'] == player_name and player.get('isHost', False):
                    is_host = True
                    break
        session['is_host'] = is_host
        session.permanent = True
        session.modified = True
        
        return render_template('game.html', 
                            game_id=game_id,
                            player_name=player_name,
                            transfer_id=transfer_id,
                            is_host=session['is_host'],
                            player_type='host' if session['is_host'] else 'guest')
                            
    except Exception as e:
        logger.error(f"Error in game route: {str(e)}")
        flash('حدث خطأ غير متوقع', 'error')
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
        
        game_dict = game.to_dict()
        logger.debug(f"Session after create: {dict(session)}")
        logger.debug(f"Game room after create: {game_dict}")
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
        session.permanent = True  # Make session permanent
        session.modified = True
        
        # Add player to game
        game.add_player(player_name)
        
        logger.debug(f"Session after join: {dict(session)}")
        logger.debug(f"Game room after join: {game.to_dict()}")
        
        # Join the socket room
        join_room(game_id)
        
        # Emit success event with game info
        emit('join_success', {
            'game_id': game_id,
            'players': [p['name'] for p in game.players],
            'host': game.host
        })
        
        # Notify other players
        emit('player_joined', {
            'players': [p['name'] for p in game.players]
        }, room=game_id)
        
    except ValueError as e:
        emit('error', {'message': str(e)})
    except Exception as e:
        logger.error(f"Error in handle_join_game: {str(e)}")
        emit('error', {'message': 'حدث خطأ غير متوقع'})

@socketio.on('start_game')
def handle_start_game(data):
    """Handle game start event."""
    try:
        game_id = str(data['game_id'])
        player_name = session.get('player_name')
        
        if not player_name:
            raise ValueError("لم يتم العثور على اسم اللاعب")
            
        if game_id not in game_rooms:
            raise ValueError("غرفة اللعب غير موجودة")
            
        game = game_rooms[game_id]
        
        # Verify the player is the host
        if not any(p['name'] == player_name and p.get('isHost', False) for p in game.players):
            raise ValueError("فقط المضيف يمكنه بدء اللعبة")
        
        # Start the game
        game.start_game()
        game.current_player = game.host  # Host starts first
        
        # Assign initial item to the first player
        initial_item = get_random_item()
        game.set_current_item(initial_item)
        
        # Generate transfer ID for secure redirect
        transfer_id = str(uuid.uuid4())
        
        # Update all players' sessions
        for player in game.players:
            socketio.emit('game_started', {
                'game_id': game_id,
                'redirect_url': f'/game/{game_id}',
                'transfer_id': transfer_id
            }, room=game_id)
        
        logger.info(f"Game {game_id} started by {player_name}")
        
    except ValueError as e:
        emit('error', {'message': str(e)})
    except Exception as e:
        logger.error(f"Error in handle_start_game: {str(e)}")
        emit('error', {'message': 'حدث خطأ غير متوقع'})

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
        if game.round_start_time is not None:
            points = calculate_score(game.round_start_time)
            current_player = game.current_player
            
            if points > 0:
                # Award points to both players
                if current_player not in game.scores:
                    game.scores[current_player] = 0
                if guesser_name not in game.scores:
                    game.scores[guesser_name] = 0
                    
                game.scores[current_player] += points
                game.scores[guesser_name] += points
        
        # Move to next player
        current_idx = next((i for i, p in enumerate(game.players) if p['name'] == game.current_player), 0)
        next_idx = (current_idx + 1) % len(game.players)
        next_player = game.players[next_idx]['name']
        
        # Update game state
        game.current_player = next_player
        game.current_item = get_random_item()
        game.round_start_time = None  # Reset timer until player is ready
        
        # Force reset timer on all clients to ensure synchronization
        # Include next player information in the event
        logger.info(f"Emitting force_reset_timer to all players in game {game_id} for correct guess")
        emit('force_reset_timer', {
            'next_player': next_player,
            'game_status': game.status
        }, room=game_id)
        
        # Emit timer start event to all players
        emit('timer_start', {
            'duration': 120
        }, room=game_id)
        
        # Notify all players of the score update
        emit_game_state(game_id, f'دور {next_player}', scores=game.scores, last_item=game.current_item)
        
        # Send new word to next player
        emit('new_item', {
            'item': game.current_item['item'],
            'category': game.current_item['category']
        }, room=get_player_sid(next_player))
        
        logger.info(f"Emitting correct guess to all players in game {game_id}")
        emit('correct_guess', {
            'guesser': guesser_name,
            'performer': current_player,
            'scores': game.scores
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
        if game.status not in ['playing', 'round_active']:
            logger.warning(f"Round timeout ignored: game status is {game.status}, expected 'playing' or 'round_active'")
            return
            
        # Get new item for next player
        next_item = get_random_item()
        game.next_round(next_item)
        
        # Set game status back to 'playing' so the next player needs to click 'Ready'
        game.status = 'playing'
        
        # Emit round_timeout event to all clients
        logger.info(f"Emitting round_timeout to all players in game {game_id}")
        emit('round_timeout', {
            'next_player': game.current_player,
            'game_status': game.status
        }, room=game_id)
        
        # Force reset timer on all clients to ensure synchronization
        # Include next player information in the event
        logger.info(f"Emitting force_reset_timer to all players in game {game_id}")
        emit('force_reset_timer', {
            'next_player': game.current_player,
            'game_status': game.status
        }, room=game_id)
        
        # Emit the current (unsolved) item to all players before changing it
        emit('reveal_item', {
            'item': game.current_item['item'],
            'category': game.current_item['category'],
            'player': game.current_player
        }, room=game_id)
        
        # Send new item to the next player
        emit('new_item', {
            'item': next_item['item'],
            'category': next_item['category']
        }, room=get_player_sid(game.current_player))

        # Update game state for all players
        emit_game_state(game_id, f"انتهى الوقت! دور {game.current_player}", current_player=game.current_player)
        
        # Log the successful turn transition
        logger.info(f"Round timeout: Turn transitioned to {game.current_player} in game {game_id}")
        
    except Exception as e:
        logger.error(f"Error handling round timeout: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('player_passed')
def handle_player_passed(data):
    try:
        game_id = str(data.get('game_id'))
        player_name = data.get('player_name')
        
        if game_id not in game_rooms:
            raise ValueError("غرفة اللعب غير موجودة")
            
        game = game_rooms[game_id]
        
        # Verify that the player requesting to pass is the current player
        if game.current_player != player_name:
            logger.warning(f"Player {player_name} tried to pass but is not the current player")
            emit('error', {'message': "أنت مش دورك عشان تعمل تخطي"})
            return
            
        # Verify that the game is in an active round
        if game.status != 'round_active':
            logger.warning(f"Player {player_name} tried to pass but game status is {game.status}")
            emit('error', {'message': "لا يمكن تخطي الدور في هذه المرحلة"})
            return
        
        logger.info(f"Player {player_name} passed their turn in game {game_id}")
        
        # Get new item for next player
        next_item = get_random_item()
        game.next_round(next_item)
        
        # Set game status back to 'playing' so the next player needs to click 'Ready'
        game.status = 'playing'
        
        # Emit pass_turn event to all clients
        logger.info(f"Emitting pass_turn to all players in game {game_id}")
        emit('pass_turn', {
            'player': player_name,
            'next_player': game.current_player,
            'game_status': game.status
        }, room=game_id)
        
        # Force reset timer on all clients to ensure synchronization
        logger.info(f"Emitting force_reset_timer to all players in game {game_id}")
        emit('force_reset_timer', {
            'next_player': game.current_player,
            'game_status': game.status
        }, room=game_id)
        
        # Emit the current (unsolved) item to all players before changing it
        emit('reveal_item', {
            'item': game.current_item['item'],
            'category': game.current_item['category'],
            'player': game.current_player
        }, room=game_id)
        
        # Send new item to the next player
        emit('new_item', {
            'item': next_item['item'],
            'category': next_item['category']
        }, room=get_player_sid(game.current_player))

        # Update game state for all players
        emit_game_state(game_id, f"{player_name} تخطى دوره! دور {game.current_player}", current_player=game.current_player)
        
        # Log the successful turn transition
        logger.info(f"Turn passed: Turn transitioned from {player_name} to {game.current_player} in game {game_id}")
        
    except Exception as e:
        logger.error(f"Error handling player pass: {str(e)}")
        emit('error', {'message': str(e)})

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
            was_host = game.host == player_name
            host_transferred = game.remove_player(player_name)
            
            # Debug log after removal
            logger.debug(f"Game room state after leave: {game.to_dict()}")
            
            # Get the updated player list
            players = game.players
            
            if not players:
                # No players left, remove the game room
                del game_rooms[room_id]
                logger.info(f"Game room {room_id} removed - no players left")
                return
            
            # If host was transferred, verify the transfer was successful
            if host_transferred:
                new_host = next((p['name'] for p in players if p.get('isHost', False)), None)
                if new_host:
                    logger.info(f"Host transferred from {player_name} to {new_host} in room {room_id}")
                    
                    # Verify game state is consistent
                    if game.host != new_host:
                        logger.error(f"Host inconsistency detected. Game host: {game.host}, Expected: {new_host}")
                        game.host = new_host  # Fix inconsistency
                    
                    # Check if turn was also transferred (when host was the current player)
                    turn_transferred = game.current_player == new_host and player_name != new_host
                    
                    # Prepare message based on whether turn was also transferred
                    message = f"{player_name} غادر اللعبة. {new_host} هو المضيف الجديد"
                    if turn_transferred and game.status == 'playing':
                        message += f" وحان دوره الآن"
                    
                    # Notify all clients about host transfer
                    emit('host_transferred', {
                        'message': message,
                        'newHost': new_host,
                        'players': players,
                        'gameState': game.to_dict()  # Send full game state
                    }, room=room_id)
                    
                    # Send special notification to new host
                    new_host_sid = get_player_sid(new_host)
                    if new_host_sid:
                        emit('you_are_host', {
                            'message': 'أنت الآن مضيف اللعبة'
                        }, room=new_host_sid)
                else:
                    logger.error(f"Host transfer failed in room {room_id}")
                    # Handle failed host transfer
                    emit('game_error', {
                        'message': 'فشل نقل استضافة اللعبة'
                    }, room=room_id)
            else:
                # Regular player left event
                emit('player_left', {
                    'message': f"{player_name} خرج من اللعبة",
                    'players': players
                }, room=room_id)
            
            # Emit update_players event to all clients in the room
            emit('update_players', {
                'players': players,
                'gameState': game.to_dict()
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
        emit('game_error', {
            'message': 'حدث خطأ أثناء مغادرة اللعبة'
        }, room=room_id)

@socketio.on('join_game_room')
def on_join_game_room(data):
    """Handle joining a game room."""
    game_id = data.get('game_id')
    player_name = data.get('player_name')
    
    if not player_name:
        player_name = session.get('player_name', 'Unknown Player')
    
    # Clear any stale flash messages
    session.pop('_flashes', None)
    
    logger.debug(f"Received join_game_room event - game_id: {game_id}, player_name: {player_name}")
    
    if game_id not in game_rooms:
        return
        
    join_room(game_id)
    logger.info(f"{request.sid} is entering room {game_id} [/]")
    logger.info(f"Player {player_name} joined game room {game_id}")
    
    # Store player name in session
    session['player_name'] = player_name
    
    # Get current players
    players = [p['name'] for p in game_rooms[game_id].players]
    logger.debug(f"Current players in room {game_id}: {players}")
    
    emit_game_state(game_id, f"{player_name} انضم للعبة", players=players)

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
        emit_game_state(game_id, 'تم تحديث قائمة اللاعبين', players=players)
        
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
        emit_game_state(game_id, "بدأت جولة جديدة", round=game.round + 1)
        
        game.round += 1
        
    except Exception as e:
        logger.error(f"Error starting next round: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('player_ready')
def handle_player_ready(data):
    try:
        game_id = str(data.get('game_id'))
        
        if game_id not in game_rooms:
            raise ValueError("غرفة اللعب غير موجودة")
            
        game = game_rooms[game_id]
        player_name = session.get('player_name')
        
        # Verify that the player is the current player
        if game.current_player != player_name:
            raise ValueError("مش دورك")
            
        # Update game status to round_active
        game.status = 'round_active'
        
        # Start the round timer
        game.start_round_timer()
        
        # Force reset timer on all clients to ensure synchronization
        # Include current player information in the event
        logger.info(f"Emitting force_reset_timer to all players in game {game_id} for player_ready")
        emit('force_reset_timer', {
            'current_player': player_name,
            'game_status': game.status
        }, room=game_id)
        
        # Emit timer start event to all players
        emit('timer_start', {
            'duration': 60  # 60 seconds per round
        }, room=game_id)
        
        # Update game state for all players
        emit_game_state(game_id, f"دور {player_name}", 
                      status=game.status,
                      current_player=game.current_player,
                      timer={'duration': 60, 'start_time': datetime.now().isoformat()})
        
        logger.info(f"Player {player_name} is ready in game {game_id}")
        
    except Exception as e:
        logger.error(f"Error handling player ready: {str(e)}")
        emit('game_error', {'message': str(e)})

@socketio.on('verify_game')
def handle_verify_game(data):
    """Handle game verification after page load."""
    try:
        game_id = str(data.get('game_id'))
        player_name = data.get('player_name')
        transfer_id = data.get('transfer_id')
        
        logger.debug(f"Verifying game - game_id: {game_id}, player_name: {player_name}, transfer_id: {transfer_id}")
        
        if not all([game_id, player_name, transfer_id]):
            raise ValueError("بيانات غير مكتملة")
            
        if game_id not in game_rooms:
            raise ValueError("غرفة اللعب غير موجودة")
            
        game = game_rooms[game_id]
        
        # Check if player is in the game
        if not any(p['name'] == player_name for p in game.players):
            raise ValueError("انت مش في اللعبة دي")
        
        # Update session
        session['game_id'] = game_id
        session['player_name'] = player_name
        session['is_host'] = any(p['name'] == player_name and p.get('isHost', False) for p in game.players)
        session.permanent = True
        session.modified = True
        
        # Join the socket room
        join_room(game_id)
        logger.info(f"Player {player_name} verified and joined game room {game_id}")
        
        # Send current game state
        emit('game_state', {
            'players': [p['name'] for p in game.players],
            'current_player': game.current_player,
            'status': game.status,
            'scores': game.scores
        })
        
        # If this is the current player and there's an item, send it
        if game.current_player == player_name and game.current_item:
            emit('new_item', {
                'item': game.current_item['item'],
                'category': game.current_item['category']
            })
            
    except ValueError as e:
        emit('error', {
            'message': str(e),
            'redirect': url_for('index')
        })
    except Exception as e:
        logger.error(f"Error in verify_game: {str(e)}")
        emit('error', {
            'message': 'حدث خطأ غير متوقع',
            'redirect': url_for('index')
        })

@socketio.on('host_withdraw')
def handle_host_withdraw(data):
    try:
        room_id = str(data.get('roomId'))
        host_name = data.get('playerName')
        
        if room_id in game_rooms:
            game = game_rooms[room_id]
            
            # Verify this is actually the host
            if game.host != host_name:
                emit('error', {'message': 'Only the host can perform this action'})
                return
            
            # Remove host and transfer to next player if any
            host_transferred = game.remove_player(host_name)
            
            # Get updated player list with full player objects
            players = game.players
            
            if not players:
                # No players left, remove the game room
                del game_rooms[room_id]
                logger.info(f"Game room {room_id} removed - no players left")
                return
            
            # Emit host withdrawn event with full player objects
            emit('host_withdrawn', {
                'message': f"{host_name} انسحب من اللعبة",
                'players': players,
                'newHost': game.host if host_transferred else None
            }, room=room_id)
            
            # Leave the room
            leave_room(room_id)
            
            # Clear host's session
            session.pop('game_id', None)
            session.pop('is_host', None)
            session.pop('player_name', None)
            session.modified = True
            
            logger.info(f"Host {host_name} withdrawn from game {room_id}")
            
    except Exception as e:
        logger.error(f"Error in handle_host_withdraw: {str(e)}")
        emit('error', {'message': str(e)})

@socketio.on('close_room')
def handle_close_room(data):
    try:
        room_id = str(data.get('roomId'))
        host_name = data.get('playerName')
        
        if room_id in game_rooms:
            game = game_rooms[room_id]
            
            # Verify this is actually the host
            if game.host != host_name:
                emit('error', {'message': 'Only the host can perform this action'})
                return
            
            # Remove the game room first
            del game_rooms[room_id]
            logger.info(f"Game room {room_id} closed by host {host_name}")
            
            # Notify all players that the room is being closed
            emit('room_closed', {
                'message': f"تم إغلاق الغرفة من قبل {host_name}",
                'redirect': '/'
            }, room=room_id, broadcast=True)
            
            # Clear host's own session
            session.clear()
            session['_permanent'] = True
            
    except Exception as e:
        logger.error(f"Error in handle_close_room: {str(e)}")
        emit('error', {'message': str(e)})

def emit_game_state(game_id, message=None, **kwargs):
    """Emit game state to all players in a room."""
    if game_id not in game_rooms:
        return
        
    game = game_rooms[game_id]
    game_dict = game.to_dict()
    state = {
        'players': [p['name'] for p in game.players],
        'status': game.status,
        'current_player': game.current_player,
        **kwargs
    }
    
    if message:
        state['message'] = message
        
    emit('game_state', state, room=game_id)

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
