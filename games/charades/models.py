"""
Models for the Charades game.
Contains data structures and game logic for the Charades game.
"""
from datetime import datetime
import random
import json
import os
from dataclasses import dataclass, asdict
from typing import List, Dict, Tuple, Optional

@dataclass
class PlayerScore:
    """Data class to represent a player's score"""
    name: str
    score: int
    is_host: bool = False

class CharadesGame:
    def __init__(self, room_id: str, host: str):
        """Initialize a new Charades game.
        
        Args:
            room_id (str): Unique identifier for the game room
            host (str): Name of the player hosting the game
        """
        self.room_id = room_id
        self.host = host
        self.players: List[PlayerScore] = [PlayerScore(name=host, score=0, is_host=True)]
        self.status = "waiting"
        self.current_player: Optional[str] = None
        self.current_item: Optional[Tuple[str, str]] = None  # (type, name)
        self.round_start_time: Optional[datetime] = None
        self.game_type = "charades"

    def add_player(self, player_name: str) -> bool:
        """Add a new player to the game.
        
        Args:
            player_name (str): Name of the player to add
            
        Returns:
            bool: True if player was added, False if player already exists
        """
        if not any(p.name == player_name for p in self.players):
            self.players.append(PlayerScore(name=player_name, score=0))
            return True
        return False

    def remove_player(self, player_name: str) -> bool:
        """Remove a player from the game.
        
        Args:
            player_name (str): Name of the player to remove
            
        Returns:
            bool: True if player was removed, False if player not found
        """
        player = next((p for p in self.players if p.name == player_name), None)
        if player:
            self.players.remove(player)
            if player_name == self.host and self.players:
                self.host = self.players[0].name
                self.players[0].is_host = True
            return True
        return False

    def get_player_score(self, player_name: str) -> int:
        """Get the score for a specific player.
        
        Args:
            player_name (str): Name of the player
            
        Returns:
            int: Player's score or 0 if player not found
        """
        player = next((p for p in self.players if p.name == player_name), None)
        return player.score if player else 0

    def update_score(self, player_name: str, points: int) -> bool:
        """Update a player's score.
        
        Args:
            player_name (str): Name of the player
            points (int): Points to add to the player's score
            
        Returns:
            bool: True if score was updated, False if player not found
        """
        player = next((p for p in self.players if p.name == player_name), None)
        if player:
            player.score += points
            return True
        return False

    def get_scores(self) -> Dict[str, int]:
        """Get all player scores.
        
        Returns:
            Dict[str, int]: Dictionary mapping player names to their scores
        """
        return {p.name: p.score for p in self.players}

    def start_round(self) -> bool:
        """Start a new round with a random item.
        
        Returns:
            bool: True if round was started successfully
        """
        if not self.players:
            return False
        
        self.current_item = self.get_random_item()
        self.round_start_time = datetime.now()
        
        if not self.current_player:
            self.current_player = self.players[0].name
        else:
            # Move to next player
            current_idx = next((i for i, p in enumerate(self.players) if p.name == self.current_player), 0)
            next_idx = (current_idx + 1) % len(self.players)
            self.current_player = self.players[next_idx].name
        
        return True

    @staticmethod
    def get_random_item() -> Tuple[str, str]:
        """Get a random item from the charades items list.
        
        Returns:
            Tuple[str, str]: A tuple containing (type, name) of the item
        """
        with open('static/data/charades_items.json', 'r', encoding='utf-8') as f:
            items = json.load(f)['items']
            item = random.choice(items)
            return (item['type'], item['name'])

    def end_round(self, correct_guess: bool = False, guesser: Optional[str] = None) -> None:
        """End the current round and update scores if necessary.
        
        Args:
            correct_guess (bool): Whether the round ended with a correct guess
            guesser (Optional[str]): Name of the player who guessed correctly
        """
        if correct_guess and guesser and self.round_start_time:
            elapsed_seconds = (datetime.now() - self.round_start_time).total_seconds()
            points = 10 if elapsed_seconds <= 60 else (5 if elapsed_seconds <= 120 else 0)
            
            # Award points to both guesser and current player
            if points > 0:
                self.update_score(guesser, points)
                if self.current_player:
                    self.update_score(self.current_player, points)

        self.current_item = None
        self.round_start_time = None

    def to_dict(self) -> dict:
        """Convert the game state to a dictionary for template rendering.
        
        Returns:
            dict: Game state as a dictionary
        """
        return {
            'game_id': self.room_id,
            'host': self.host,
            'players': [asdict(p) for p in self.players],
            'status': self.status,
            'current_player': self.current_player,
            'current_item': self.current_item,
            'game_type': self.game_type
        }

# Game rooms storage
game_rooms = {}  # {room_id: CharadesGame}
game_state_transfer = {}  # Temporary storage for game state during transitions
