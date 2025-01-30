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
        self.players = [host]
        self.status = "waiting"
        self.scores = {host: 0}
        self.current_player = None
        self.current_item = None
        self.round_start_time = None
        self.game_type = "charades"

    def add_player(self, player_name):
        """Add a new player to the game."""
        if player_name not in self.players:
            self.players.append(player_name)
            self.scores[player_name] = 0
            return True
        return False

    def remove_player(self, player_name):
        """Remove a player from the game."""
        if player_name in self.players:
            self.players.remove(player_name)
            del self.scores[player_name]
            if player_name == self.host and self.players:
                self.host = self.players[0]
            return True
        return False

    def start_round(self):
        """Start a new round with a random item."""
        if not self.players:
            return False
        
        self.current_item = self.get_random_item()
        self.round_start_time = datetime.now()
        if not self.current_player or self.current_player not in self.players:
            self.current_player = self.players[0]
        else:
            current_index = self.players.index(self.current_player)
            next_index = (current_index + 1) % len(self.players)
            self.current_player = self.players[next_index]
        
        self.status = "playing"
        return True

    def calculate_score(self):
        """Calculate score based on time taken."""
        if not self.round_start_time:
            return 0
            
        elapsed_seconds = (datetime.now() - self.round_start_time).total_seconds()
        if elapsed_seconds <= 60:  # First minute
            return 10
        elif elapsed_seconds <= 120:  # Second minute
            return 5
        return 0

    @staticmethod
    def get_random_item():
        """Get a random item from the charades items list."""
        items_path = os.path.join('static', 'data', 'charades_items.json')
        with open(items_path, 'r', encoding='utf-8') as f:
            items = json.load(f)['items']
        return random.choice(items)

    def to_dict(self):
        """Convert game state to dictionary for storage."""
        return {
            "room_id": self.room_id,
            "host": self.host,
            "players": self.players,
            "status": self.status,
            "scores": self.scores,
            "current_player": self.current_player,
            "current_item": self.current_item,
            "round_start_time": self.round_start_time.isoformat() if self.round_start_time else None,
            "game_type": self.game_type
        }

    @classmethod
    def from_dict(cls, data):
        """Create a game instance from dictionary data."""
        game = cls(data["room_id"], data["host"])
        game.players = data["players"]
        game.status = data["status"]
        game.scores = data["scores"]
        game.current_player = data["current_player"]
        game.current_item = data["current_item"]
        game.round_start_time = datetime.fromisoformat(data["round_start_time"]) if data["round_start_time"] else None
        game.game_type = data["game_type"]
        return game
