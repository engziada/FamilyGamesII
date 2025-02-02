"""
Models for the Charades game.
Contains data structures and game logic for the Charades game.
"""
from datetime import datetime
import random
import json
import os

class CharadesGame:
    def __init__(self, room_id, host):
        self.room_id = room_id
        self.host = host
        self.players = [{'name': host, 'isHost': True}]
        self.status = "waiting"
        self.scores = {host: 0}
        self.current_player = None
        self.current_item = None
        self.round_start_time = None
        self.game_type = "charades"

    def add_player(self, player_name):
        """Add a new player to the game."""
        if not any(p['name'] == player_name for p in self.players):
            self.players.append({'name': player_name, 'isHost': False})
            self.scores[player_name] = 0
            return True
        return False

    def remove_player(self, player_name):
        """Remove a player from the game."""
        player = next((p for p in self.players if p['name'] == player_name), None)
        if player:
            self.players.remove(player)
            del self.scores[player_name]
            if player_name == self.host and self.players:
                self.host = self.players[0]['name']
                self.players[0]['isHost'] = True
            return True
        return False

    def start_round(self):
        """Start a new round with a random item."""
        if not self.players:
            return False
        
        self.current_item = self.get_random_item()
        self.round_start_time = datetime.now()
        
        if not self.current_player:
            self.current_player = self.players[0]['name']
        else:
            current_index = next((i for i, p in enumerate(self.players) if p['name'] == self.current_player), -1)
            if current_index != -1:
                next_index = (current_index + 1) % len(self.players)
                self.current_player = self.players[next_index]['name']
            else:
                self.current_player = self.players[0]['name']
        
        return True

    def end_round(self, winner=None):
        """End the current round and update scores."""
        if winner and self.round_start_time:
            score = self.calculate_score(self.round_start_time)
            self.scores[winner] = self.scores.get(winner, 0) + score
            self.scores[self.current_player] = self.scores.get(self.current_player, 0) + score
        
        self.current_item = None
        self.round_start_time = None
        return True

    def calculate_score(self, start_time):
        """Calculate score based on elapsed time."""
        elapsed_seconds = (datetime.now() - start_time).total_seconds()
        if elapsed_seconds <= 60:  # First minute
            return 10
        elif elapsed_seconds <= 120:  # Second minute
            return 5
        return 0

    def get_random_item(self):
        """Get a random item from the charades items list."""
        items_path = os.path.join('static', 'data', 'charades_items.json')
        with open(items_path, 'r', encoding='utf-8') as f:
            items = json.load(f)['items']
        return random.choice(items)

    def to_dict(self):
        """Convert game state to dictionary."""
        return {
            'room_id': self.room_id,
            'host': self.host,
            'players': self.players,
            'status': self.status,
            'scores': self.scores,
            'current_player': self.current_player,
            'current_item': self.current_item,
            'round_start_time': self.round_start_time.isoformat() if self.round_start_time else None,
            'game_type': self.game_type
        }

# Game rooms storage
game_rooms = {}  # {room_id: CharadesGame}
game_state_transfer = {}  # Temporary storage for game state during transitions
