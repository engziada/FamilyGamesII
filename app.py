import eventlet
eventlet.monkey_patch()

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
game_rooms = {}  # {room_id: {host: str, players: list, game_type: str, status: str, scores: dict, current_player: str, current_item: str, round_start_time: datetime}}
game_state_transfer = {}  # Temporary storage for game state during transitions

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

@app.route('/transfer_state/<transfer_id>')
def transfer_state(transfer_id):
    if transfer_id in game_state_transfer:
        state = game_state_transfer[transfer_id]
        del game_state_transfer[transfer_id]  # Clean up after use
        return state
    return {'error': 'State not found'}, 404

@app.route('/game/<game_id>')
def game(game_id):
    logger.debug(f"Accessing game route with game_id: {game_id}")
    
    # Get transfer ID from query params
    transfer_id = request.args.get('transfer_id')
    if transfer_id:
        # Try to get state from transfer storage
        state = game_state_transfer.get(transfer_id)
        if state:
            logger.debug(f"Found transferred state for game {game_id}")
            # Store player info in session
            session['game_id'] = game_id
            session['player_name'] = state['player_name']
            session['is_host'] = state['is_host']
            session.modified = True
            
            logger.debug(f"Restored session state: {dict(session)}")
            del game_state_transfer[transfer_id]  # Clean up
            return render_template('game.html', **state)
    
    # Fall back to regular game state if no transfer state
    if game_id not in game_rooms:
        logger.warning(f"Game {game_id} not found in game_rooms")
        return redirect(url_for('index'))
    
    player_name = session.get('player_name')
    is_host = session.get('is_host', False)
    
    if not player_name or not any(p['name'] == player_name for p in game_rooms[game_id]['players']):
        logger.warning(f"Player {player_name} not found in game {game_id}")
        return redirect(url_for('index'))
    
    return render_template('game.html',
        game_id=game_id,
        player_name=player_name,
        is_host=is_host,
        players=game_rooms[game_id]['players'],
        current_player=game_rooms[game_id]['current_player'],
        current_item=game_rooms[game_id]['current_item'] if is_host else None,
        scores=game_rooms[game_id].get('scores', {})
    )

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
        logger.debug(f"Starting game {game_id}")
        
        if game_id not in game_rooms:
            raise ValueError("غرفة اللعب غير موجودة")
            
        player_name = session.get('player_name')
        if not player_name:
            raise ValueError("فقط اللعيب الكبير يقدر يبدأ اللعبة")
            
        # Check if player is the host
        if player_name != game_rooms[game_id]['host']:
            raise ValueError("فقط اللعيب الكبير يقدر يبدأ اللعبة")
            
        # Debug log the current game room state
        logger.debug(f"Game room state before start: {game_rooms[game_id]}")
        logger.debug(f"Number of players: {len(game_rooms[game_id]['players'])}")
        logger.debug(f"Players list: {[p['name'] for p in game_rooms[game_id]['players']]}")
            
        # Check if we have enough players
        if len(game_rooms[game_id]['players']) < 2:
            raise ValueError("محتاجين على الأقل لاعبين للعب")
            
        # Update game status
        game_rooms[game_id]['status'] = 'playing'
        game_rooms[game_id]['current_item'] = get_random_item()
        game_rooms[game_id]['round_start_time'] = datetime.now()
        game_rooms[game_id]['current_player'] = game_rooms[game_id]['players'][0]['name']
        game_rooms[game_id]['scores'] = {player['name']: 0 for player in game_rooms[game_id]['players']}
        
        # Generate base transfer ID
        base_transfer_id = f"{game_id}_{datetime.now().timestamp()}"
        
        # Create individual transfer states for each player
        for player in game_rooms[game_id]['players']:
            player_transfer_id = f"{base_transfer_id}_{player['name']}"
            game_state_transfer[player_transfer_id] = {
                'game_id': game_id,
                'player_name': player['name'],
                'is_host': player['isHost'],
                'players': game_rooms[game_id]['players'],
                'current_player': game_rooms[game_id]['current_player'],
                'current_item': game_rooms[game_id]['current_item'] if player['isHost'] else None,
                'scores': game_rooms[game_id]['scores']
            }
            
            # Store the transfer ID in the game room for each player
            if 'transfer_ids' not in game_rooms[game_id]:
                game_rooms[game_id]['transfer_ids'] = {}
            game_rooms[game_id]['transfer_ids'][player['name']] = player_transfer_id
        
        # Emit game started event to all players in the room
        emit('game_started', {
            'game_id': game_id,
            'transfer_id': game_rooms[game_id]['transfer_ids'][player_name],
            'url': f'/game/{game_id}'
        }, room=game_id)
        
        logger.info(f"Game {game_id} started by {player_name}")
        
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
        player_name = session.get('player_name')
        game_id = session.get('game_id')
        is_host = session.get('is_host', False)

        logger.debug(f"Session after disconnect: {session}")

        if not game_id or not player_name:
            return

        if game_id in game_rooms:
            # Check if this is a page transition by looking for a transfer state
            is_page_transition = any(
                state.get('game_id') == game_id 
                for state in game_state_transfer.values()
            )
            
            # Only handle disconnection if it's not a page transition
            if not is_page_transition:
                if is_host:
                    # Host disconnected - end the game
                    logger.info(f"Game {game_id} ended - host disconnected")
                    emit('game_ended', {
                        'message': 'اللعيب الكبير خرج من اللعبة'
                    }, room=game_id)
                    del game_rooms[game_id]
                else:
                    # Regular player disconnected - remove from game
                    logger.info(f"Player {player_name} disconnected from game {game_id}")
                    game_rooms[game_id]['players'] = [
                        p for p in game_rooms[game_id]['players'] 
                        if p['name'] != player_name
                    ]
                    
                    # Update other players
                    emit('update_players', {
                        'players': [p['name'] for p in game_rooms[game_id]['players']]
                    }, room=game_id)
                    
                    emit('player_left', {
                        'message': f"{player_name} خرج من اللعبة",
                        'players': game_rooms[game_id]['players']
                    }, room=game_id)
                    
                leave_room(game_id)
                
    except Exception as e:
        logger.error(f"Error in disconnect handler: {str(e)}")

@socketio.on('leave_game')
def handle_leave_game(data):
    try:
        room_id = str(data.get('roomId'))
        player_name = data.get('playerName')
        
        if room_id in game_rooms:
            # Debug log before removal
            logger.debug(f"Game room state before leave: {game_rooms[room_id]}")
            
            # Remove player from the game room's player list
            game_rooms[room_id]['players'] = [p for p in game_rooms[room_id]['players'] if p['name'] != player_name]
            
            # Debug log after removal
            logger.debug(f"Game room state after leave: {game_rooms[room_id]}")
            
            # Get the updated player list
            players = [p['name'] for p in game_rooms[room_id]['players']]
            
            # Emit update_players event to all clients in the room
            emit('update_players', {'players': players}, room=room_id)
            
            # Emit player_left event with updated player list
            emit('player_left', {
                'message': f"{player_name} خرج من اللعبة",
                'players': game_rooms[room_id]['players']
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
    try:
        logger.info("Starting server...")
        # Run the app with SocketIO
        socketio.run(app, host='127.0.0.1', port=5000, debug=True)
    except Exception as e:
        logger.error(f"Error starting server: {str(e)}")
        raise