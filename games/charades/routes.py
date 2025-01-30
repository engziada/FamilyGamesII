"""
Routes for the Charades game.
Contains all the route handlers and socket events for the Charades game.
"""
from flask import session, request
from flask_socketio import emit, join_room, leave_room
import logging
from datetime import datetime

from .models import CharadesGame

# Game rooms storage
game_rooms = {}  # {room_id: CharadesGame}
logger = logging.getLogger(__name__)

def register_routes(socketio):
    @socketio.on('connect')
    def handle_connect():
        """Handle client connection."""
        logger.debug(f"Client connected. Session: {session}")
        if 'room' in session:
            join_room(session['room'])

    @socketio.on('join_game_room')
    def handle_join_game_room(data):
        """Handle player joining a game room."""
        try:
            room_id = data.get('roomId')
            player_name = data.get('playerName')
            
            if not room_id or not player_name:
                emit('error', {'message': 'Missing room ID or player name'})
                return
                
            if room_id not in game_rooms:
                game = CharadesGame(room_id, player_name)
                game_rooms[room_id] = game
                logger.info(f"Created new game room {room_id} for player {player_name}")
            
            game = game_rooms[room_id]
            if player_name not in game.players:
                game.add_player(player_name)
            
            join_room(room_id)
            session['room'] = room_id
            session['name'] = player_name
            
            logger.info(f"Player {player_name} joined room {room_id}")
            emit('room_joined', {
                'players': game.players,
                'host': game.host,
                'scores': game.scores,
                'status': game.status
            }, room=room_id)
            
        except Exception as e:
            logger.error(f"Error joining game room: {str(e)}")
            emit('error', {'message': 'Failed to join game room'})

    @socketio.on('create_game')
    def handle_create_game(data):
        """Handle game creation request."""
        try:
            room_id = data.get('roomId')
            player_name = data.get('playerName')
            
            if not room_id or not player_name:
                emit('error', {'message': 'Missing room ID or player name'})
                return
                
            if room_id in game_rooms:
                emit('error', {'message': 'Room already exists'})
                return
                
            game = CharadesGame(room_id, player_name)
            game_rooms[room_id] = game
            
            join_room(room_id)
            session['room'] = room_id
            session['name'] = player_name
            
            logger.info(f"Game created: Room {room_id}, Host: {player_name}")
            emit('game_created', {
                'roomId': room_id,
                'players': game.players,
                'host': game.host
            }, room=room_id)
            
        except Exception as e:
            logger.error(f"Error creating game: {str(e)}")
            emit('error', {'message': 'Failed to create game'})

    @socketio.on('join_game')
    def handle_join_game(data):
        """Handle player joining a game."""
        try:
            room_id = data.get('roomId')
            player_name = data.get('playerName')
            
            if not room_id or not player_name:
                emit('error', {'message': 'Missing room ID or player name'})
                return
                
            if room_id not in game_rooms:
                emit('error', {'message': 'Game room not found'})
                return
                
            game = game_rooms[room_id]
            if game.status != "waiting":
                emit('error', {'message': 'Game already started'})
                return
                
            if game.add_player(player_name):
                join_room(room_id)
                session['room'] = room_id
                session['name'] = player_name
                
                logger.info(f"Player {player_name} joined room {room_id}")
                emit('player_joined', {
                    'players': game.players,
                    'host': game.host
                }, room=room_id)
            else:
                emit('error', {'message': 'Player already in game'})
                
        except Exception as e:
            logger.error(f"Error joining game: {str(e)}")
            emit('error', {'message': 'Failed to join game'})

    @socketio.on('start_game')
    def handle_start_game(data):
        """Handle game start request."""
        try:
            room_id = session.get('room')
            player_name = session.get('name')
            
            if not room_id or room_id not in game_rooms:
                emit('error', {'message': 'Invalid game room'})
                return
                
            game = game_rooms[room_id]
            if player_name != game.host:
                emit('error', {'message': 'Only host can start the game'})
                return
                
            if len(game.players) < 2:
                emit('error', {'message': 'Need at least 2 players to start'})
                return
                
            if game.start_round():
                logger.info(f"Game started in room {room_id}")
                emit('game_started', {
                    'currentPlayer': game.current_player,
                    'currentItem': game.current_item if game.current_player == player_name else None,
                    'players': game.players,
                    'scores': game.scores
                }, room=room_id)
            else:
                emit('error', {'message': 'Failed to start game'})
                
        except Exception as e:
            logger.error(f"Error starting game: {str(e)}")
            emit('error', {'message': 'Failed to start game'})

    @socketio.on('guess_correct')
    def handle_guess_correct(data):
        """Handle correct guess submission."""
        try:
            room_id = session.get('room')
            player_name = session.get('name')
            
            if not room_id or room_id not in game_rooms:
                emit('error', {'message': 'Invalid game room'})
                return
                
            game = game_rooms[room_id]
            if game.status != "playing":
                emit('error', {'message': 'Game is not in playing state'})
                return
                
            score = game.calculate_score()
            game.scores[player_name] += score
            
            emit('round_ended', {
                'winner': player_name,
                'scores': game.scores,
                'item': game.current_item,
                'points': score
            }, room=room_id)
            
            logger.info(f"Correct guess by {player_name} in room {room_id}")
            
        except Exception as e:
            logger.error(f"Error handling correct guess: {str(e)}")
            emit('error', {'message': 'Failed to process guess'})

    @socketio.on('round_timeout')
    def handle_round_timeout(data):
        """Handle round timeout."""
        try:
            room_id = session.get('room')
            if not room_id or room_id not in game_rooms:
                emit('error', {'message': 'Invalid game room'})
                return
                
            game = game_rooms[room_id]
            if game.status != "playing":
                emit('error', {'message': 'Game is not in playing state'})
                return
                
            emit('round_ended', {
                'timeout': True,
                'scores': game.scores,
                'item': game.current_item
            }, room=room_id)
            
            logger.info(f"Round timeout in room {room_id}")
            
        except Exception as e:
            logger.error(f"Error handling round timeout: {str(e)}")
            emit('error', {'message': 'Failed to process timeout'})

    @socketio.on('next_round')
    def handle_next_round(data):
        """Handle next round request."""
        try:
            room_id = session.get('room')
            player_name = session.get('name')
            
            if not room_id or room_id not in game_rooms:
                emit('error', {'message': 'Invalid game room'})
                return
                
            game = game_rooms[room_id]
            if game.start_round():
                emit('round_started', {
                    'currentPlayer': game.current_player,
                    'currentItem': game.current_item if game.current_player == player_name else None,
                    'players': game.players,
                    'scores': game.scores
                }, room=room_id)
                
                logger.info(f"Next round started in room {room_id}")
            else:
                emit('error', {'message': 'Failed to start next round'})
                
        except Exception as e:
            logger.error(f"Error starting next round: {str(e)}")
            emit('error', {'message': 'Failed to start next round'})

    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle player disconnection."""
        try:
            room_id = session.get('room')
            player_name = session.get('name')
            
            if room_id and room_id in game_rooms:
                game = game_rooms[room_id]
                if game.remove_player(player_name):
                    leave_room(room_id)
                    
                    if not game.players:
                        del game_rooms[room_id]
                        logger.info(f"Room {room_id} deleted - no players left")
                    else:
                        emit('player_left', {
                            'player': player_name,
                            'players': game.players,
                            'host': game.host,
                            'scores': game.scores
                        }, room=room_id)
                        
                        logger.info(f"Player {player_name} left room {room_id}")
                        
            session.pop('room', None)
            session.pop('name', None)
            
        except Exception as e:
            logger.error(f"Error handling disconnect: {str(e)}")
