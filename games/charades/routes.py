"""
Routes for the Charades game.
Contains all the route handlers and socket events for the Charades game.
"""
from flask import session, request
from flask_socketio import emit, join_room, leave_room
import logging
from datetime import datetime
import random
import string

from .models import CharadesGame, game_rooms, game_state_transfer

logger = logging.getLogger(__name__)

def register_charades_routes(socketio):
    @socketio.on('connect')
    def handle_connect():
        """Handle client connection."""
        logger.debug(f"Client connected. Session: {session}")
        if 'room' in session:
            join_room(session['room'])

    @socketio.on('create_game')
    def handle_create_game(data):
        """Handle game creation request."""
        try:
            player_name = data.get('playerName')
            if not player_name:
                emit('error', {'message': 'Player name is required'})
                return

            # Generate a unique room ID
            room_id = ''.join(random.choices(string.digits, k=4))
            while room_id in game_rooms:
                room_id = ''.join(random.choices(string.digits, k=4))

            # Create new game
            game = CharadesGame(room_id, player_name)
            game_rooms[room_id] = game
            
            # Join the room
            join_room(room_id)
            session['room'] = room_id
            session['name'] = player_name
            session['is_host'] = True
            
            logger.info(f"Created game room {room_id} for player {player_name}")
            emit('game_created', {
                'game_id': room_id,
                'players': game.players,
                'host': game.host
            })
            
        except Exception as e:
            logger.error(f"Error creating game: {e}")
            emit('error', {'message': 'Failed to create game'})

    @socketio.on('join_game')
    def handle_join_game(data):
        """Handle player joining a game."""
        try:
            room_id = data.get('roomId')
            player_name = data.get('playerName')
            
            if not room_id or not player_name:
                emit('error', {'message': 'Room ID and player name are required'})
                return
            
            if room_id not in game_rooms:
                emit('error', {'message': 'Game room not found'})
                return
            
            game = game_rooms[room_id]
            if game.status != 'waiting':
                emit('error', {'message': 'Game has already started'})
                return
            
            if any(p['name'] == player_name for p in game.players):
                emit('error', {'message': 'Player name already taken'})
                return
            
            # Add player to game
            game.add_player(player_name)
            join_room(room_id)
            session['room'] = room_id
            session['name'] = player_name
            session['is_host'] = False
            
            logger.info(f"Player {player_name} joined game {room_id}")
            emit('join_success', {
                'game_id': room_id,
                'players': game.players,
                'host': game.host
            })
            
            # Notify other players
            emit('player_joined', {
                'players': game.players,
                'host': game.host
            }, room=room_id)
            
        except Exception as e:
            logger.error(f"Error joining game: {e}")
            emit('error', {'message': 'Failed to join game'})

    @socketio.on('start_game')
    def handle_start_game(data):
        """Handle game start request."""
        try:
            room_id = session.get('room')
            player_name = session.get('name')
            
            if not room_id or not player_name:
                emit('error', {'message': 'Not in a game room'})
                return
            
            game = game_rooms.get(room_id)
            if not game:
                emit('error', {'message': 'Game not found'})
                return
            
            if player_name != game.host:
                emit('error', {'message': 'Only host can start the game'})
                return
            
            if len(game.players) < 2:
                emit('error', {'message': 'Need at least 2 players to start'})
                return
            
            # Start the game
            game.status = 'playing'
            game.start_round()
            
            # Generate transfer ID for state preservation
            transfer_id = f"{room_id}_{datetime.now().timestamp()}_{player_name}"
            game_state_transfer[transfer_id] = {
                'game_id': room_id,
                'player_name': player_name,
                'is_host': True,
                'players': game.players,
                'current_player': game.current_player,
                'current_item': game.current_item,
                'scores': game.scores
            }
            
            # Notify all players
            emit('game_started', {
                'url': f'/game/{room_id}',
                'transfer_id': transfer_id,
                'scores': game.scores
            }, room=room_id)
            
        except Exception as e:
            logger.error(f"Error starting game: {e}")
            emit('error', {'message': 'Failed to start game'})

    @socketio.on('guess_correct')
    def handle_guess_correct(data):
        """Handle correct guess submission."""
        try:
            room_id = session.get('room')
            player_name = session.get('name')
            
            if not room_id or not player_name:
                emit('error', {'message': 'Not in a game room'})
                return
            
            game = game_rooms.get(room_id)
            if not game:
                emit('error', {'message': 'Game not found'})
                return
            
            if game.status != 'playing':
                emit('error', {'message': 'Game is not in playing state'})
                return
            
            # End the round and update scores
            game.end_round(winner=player_name)
            
            # Notify all players
            emit('round_ended', {
                'scores': game.scores,
                'last_item': game.current_item
            }, room=room_id)
            
        except Exception as e:
            logger.error(f"Error handling correct guess: {e}")
            emit('error', {'message': 'Failed to process guess'})

    @socketio.on('round_timeout')
    def handle_round_timeout(data):
        """Handle round timeout."""
        try:
            room_id = session.get('room')
            player_name = session.get('name')
            
            if not room_id or not player_name:
                emit('error', {'message': 'Not in a game room'})
                return
            
            game = game_rooms.get(room_id)
            if not game:
                emit('error', {'message': 'Game not found'})
                return
            
            if game.status != 'playing':
                emit('error', {'message': 'Game is not in playing state'})
                return
            
            # End the round without a winner
            game.end_round()
            
            # Notify all players
            emit('round_ended', {
                'timeout': True,
                'scores': game.scores,
                'last_item': game.current_item
            }, room=room_id)
            
        except Exception as e:
            logger.error(f"Error handling round timeout: {e}")
            emit('error', {'message': 'Failed to process round timeout'})

    @socketio.on('next_round')
    def handle_next_round(data):
        """Handle next round request."""
        try:
            room_id = session.get('room')
            player_name = session.get('name')
            
            if not room_id or not player_name:
                emit('error', {'message': 'Not in a game room'})
                return
            
            game = game_rooms.get(room_id)
            if not game:
                emit('error', {'message': 'Game not found'})
                return
            
            if player_name != game.host:
                emit('error', {'message': 'Only host can start next round'})
                return
            
            # Start new round
            game.start_round()
            
            # Notify all players
            emit('round_started', {
                'current_player': game.current_player,
                'current_item': game.current_item
            }, room=room_id)
            
        except Exception as e:
            logger.error(f"Error starting next round: {e}")
            emit('error', {'message': 'Failed to start next round'})

    @socketio.on('leave_game')
    def handle_leave_game(data):
        """Handle player leaving game."""
        try:
            room_id = session.get('room')
            player_name = session.get('name')
            
            if not room_id or not player_name:
                emit('error', {'message': 'Not in a game room'})
                return
            
            game = game_rooms.get(room_id)
            if not game:
                emit('error', {'message': 'Game not found'})
                return
            
            # Remove player from game
            game.remove_player(player_name)
            leave_room(room_id)
            session.pop('room', None)
            session.pop('name', None)
            session.pop('is_host', None)
            
            # If no players left, remove the game
            if not game.players:
                del game_rooms[room_id]
            else:
                # Notify remaining players
                emit('player_left', {
                    'players': game.players,
                    'host': game.host,
                    'scores': game.scores
                }, room=room_id)
            
        except Exception as e:
            logger.error(f"Error leaving game: {e}")
            emit('error', {'message': 'Failed to leave game'})

    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle client disconnection."""
        try:
            room_id = session.get('room')
            player_name = session.get('name')
            
            if room_id and player_name:
                game = game_rooms.get(room_id)
                if game:
                    # Remove player from game
                    game.remove_player(player_name)
                    leave_room(room_id)
                    
                    # If no players left, remove the game
                    if not game.players:
                        del game_rooms[room_id]
                    else:
                        # Notify remaining players
                        emit('player_left', {
                            'players': game.players,
                            'host': game.host,
                            'scores': game.scores
                        }, room=room_id)
            
            session.pop('room', None)
            session.pop('name', None)
            session.pop('is_host', None)
            
        except Exception as e:
            logger.error(f"Error handling disconnect: {e}")
