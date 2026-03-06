"""
Riddles game models.
Players take turns solving riddles - one reads, others guess.
"""
from datetime import datetime
import random
import json
import os
from services.data_service import get_data_service


class RiddlesGame:
    """Riddles game where players solve riddles.
    
    Game flow:
    1. A riddle is presented to all players
    2. Players buzz in to answer
    3. Correct answer = points; Wrong = others can try
    4. After time or correct answer, next riddle
    """
    
    def __init__(self, game_id: str, host: str, settings: dict = None):
        """Initialize a Riddles game.
        
        Args:
            game_id: Unique game identifier
            host: Name of the host player
            settings: Game settings dictionary
        """
        self.game_id = game_id
        self.host = host
        self.players = [{'name': host, 'isHost': True}]
        self.game_type = 'riddles'
        self.status = 'waiting'
        self.scores = {}
        
        # Game state
        self.current_riddle = None
        self.riddle_index = 0
        self.riddles_asked = 0
        self.current_reader = None  # Player reading the riddle
        self.buzzed_player = None
        self.question_active = False
        self.riddle_revealed = False  # Whether answer was shown
        
        # Settings
        self.settings = settings or {
            'riddles_per_game': 10,
            'time_limit': 30,
            'points_correct': 10,
            'points_bonus': 5  # Bonus for quick answer
        }
        
        # Load riddles
        self.riddles = self._load_riddles()
        self.test_riddles = None  # For unit testing
        self.used_riddles = set()
        
        # Timing
        self.round_start_time = None
        
        # Data service
        self.data_service = get_data_service()
    
    def _load_riddles(self) -> list:
        """Load riddles from JSON file.
        
        Returns:
            List of riddle objects
        """
        riddles_path = os.path.join('static', 'data', 'riddles.json')
        try:
            with open(riddles_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return []
    
    def add_player(self, player_name: str) -> None:
        """Add a player to the game.
        
        Args:
            player_name: Name of the player to add
            
        Raises:
            ValueError: If room is full or player already exists
        """
        if len(self.players) >= 8:
            raise ValueError("الغرفة ممتلئة")
        if any(p['name'] == player_name for p in self.players):
            raise ValueError("اللاعب موجود بالفعل")
        
        self.players.append({'name': player_name, 'isHost': False})
    
    def remove_player(self, player_name: str) -> bool:
        """Remove a player from the game.
        
        Args:
            player_name: Name of the player to remove
            
        Returns:
            True if host was transferred, False otherwise
        """
        was_host = any(p['name'] == player_name and p.get('isHost', True) for p in self.players)
        
        self.players = [p for p in self.players if p['name'] != player_name]
        
        if player_name in self.scores:
            del self.scores[player_name]
        
        # Transfer host if needed
        if was_host and self.players:
            new_host = self.players[0]['name']
            self.transfer_host(new_host)
            return True
        
        return False
    
    def transfer_host(self, new_host: str) -> None:
        """Transfer host privileges to another player.
        
        Args:
            new_host: Name of the new host
        """
        for player in self.players:
            player['isHost'] = (player['name'] == new_host)
        self.host = new_host
    
    def start_game(self) -> dict:
        """Start the game.
        
        Returns:
            dict with first riddle
            
        Raises:
            ValueError: If not enough players
        """
        if len(self.players) < 2:
            raise ValueError("عدد اللاعبين غير كافي")
        
        self.status = 'playing'
        self.riddles_asked = 0
        self.used_riddles = set()
        
        # Assign first reader (host or random)
        self.current_reader = self.host
        
        return self._get_next_riddle()
    
    def _get_next_riddle(self) -> dict:
        """Get the next riddle.
        
        Returns:
            dict with riddle data or None if game ended
        """
        if self.riddles_asked >= self.settings.get('riddles_per_game', 10):
            self.status = 'ended'
            return None
        
        # Use test riddles if available
        riddles_pool = self.test_riddles if self.test_riddles else self.riddles
        
        if not riddles_pool:
            self.status = 'ended'
            return None
        
        # Get available riddles (not used yet)
        available = [r for i, r in enumerate(riddles_pool) if i not in self.used_riddles]
        
        if not available:
            # Reset if all used
            self.used_riddles = set()
            available = riddles_pool
        
        # Select random riddle
        riddle = random.choice(available)
        riddle_idx = riddles_pool.index(riddle)
        self.used_riddles.add(riddle_idx)
        
        self.current_riddle = riddle
        self.riddles_asked += 1
        self.question_active = True
        self.buzzed_player = None
        self.riddle_revealed = False
        self.round_start_time = datetime.now()
        
        return {
            'riddle': riddle['riddle'],
            'difficulty': riddle.get('difficulty', 'medium'),
            'category': riddle.get('category', 'عام'),
            'riddle_number': self.riddles_asked,
            'reader': self.current_reader
        }
    
    def buzz_in(self, player_name: str) -> dict:
        """Buzz in to answer the riddle.
        
        Args:
            player_name: Name of the player buzzing
            
        Returns:
            dict with buzz result
        """
        if not self.question_active:
            return {'success': False, 'message': 'لا يوجد لغز حالي'}
        
        if self.buzzed_player:
            return {'success': False, 'message': f'{self.buzzed_player} ضغط بالفعل'}
        
        if player_name == self.current_reader:
            return {'success': False, 'message': 'القارئ لا يجيب!'}
        
        self.buzzed_player = player_name
        
        return {
            'success': True,
            'player': player_name,
            'message': f'{player_name} يفكر...'
        }
    
    def submit_answer(self, player_name: str, answer: str) -> dict:
        """Submit an answer to the riddle.
        
        Args:
            player_name: Name of the player answering
            answer: The answer text
            
        Returns:
            dict with answer result
        """
        if not self.current_riddle:
            return {'success': False, 'message': 'لا يوجد لغز حالي'}
        
        if player_name != self.buzzed_player:
            return {'success': False, 'message': 'لم تضغط أولاً!'}
        
        # Check answer (case-insensitive, strip whitespace)
        correct_answer = self.current_riddle['answer'].strip().lower()
        submitted = answer.strip().lower()
        
        is_correct = submitted == correct_answer
        
        if is_correct:
            # Calculate points
            elapsed = (datetime.now() - self.round_start_time).total_seconds() if self.round_start_time else 0
            points = self.settings.get('points_correct', 10)
            
            # Bonus for quick answer (under 5 seconds)
            if elapsed <= 5:
                points += self.settings.get('points_bonus', 5)
            
            self.add_score(player_name, points)
            self.question_active = False
            self.riddle_revealed = True
            
            return {
                'success': True,
                'correct': True,
                'answer': self.current_riddle['answer'],
                'points': points,
                'message': f'🎉 صحيح! الإجابة: {self.current_riddle["answer"]}'
            }
        else:
            # Wrong answer - unlock for others
            self.buzzed_player = None
            
            return {
                'success': True,
                'correct': False,
                'message': '❌ إجابة خاطئة! حاول شخص آخر'
            }
    
    def buzz_timeout(self) -> dict:
        """Handle timeout for buzzed player.
        
        Returns:
            dict with timeout result
        """
        if not self.buzzed_player:
            return {'success': False, 'message': 'لا أحد ضغط'}
        
        timed_out_player = self.buzzed_player
        self.buzzed_player = None
        
        return {
            'success': True,
            'unlocked': True,
            'message': f'انتهى وقت {timed_out_player}! ضغطوا مرة أخرى'
        }
    
    def skip_riddle(self) -> dict:
        """Skip current riddle and show answer.
        
        Returns:
            dict with next riddle or game end
        """
        if not self.current_riddle:
            return {'success': False, 'message': 'لا يوجد لغز حالي'}
        
        self.riddle_revealed = True
        self.question_active = False
        
        result = {
            'success': True,
            'answer': self.current_riddle['answer'],
            'message': f'تم تخطي اللغز! الإجابة: {self.current_riddle["answer"]}'
        }
        
        return result
    
    def next_riddle(self) -> dict:
        """Move to the next riddle.
        
        Returns:
            dict with next riddle data
        """
        next_data = self._get_next_riddle()
        
        if next_data is None:
            return {
                'game_ended': True,
                'scores': self.scores,
                'message': 'انتهت اللعبة!'
            }
        
        return next_data
    
    def reveal_answer(self) -> dict:
        """Reveal the answer without anyone answering correctly.
        
        Returns:
            dict with answer
        """
        if not self.current_riddle:
            return {'success': False}
        
        self.riddle_revealed = True
        self.question_active = False
        
        return {
            'success': True,
            'answer': self.current_riddle['answer'],
            'message': f'الإجابة: {self.current_riddle["answer"]}'
        }
    
    def add_score(self, player_name: str, points: int) -> None:
        """Add points to a player's score.
        
        Args:
            player_name: Name of the player
            points: Points to add
        """
        if player_name not in self.scores:
            self.scores[player_name] = 0
        self.scores[player_name] += points
    
    def to_dict(self, include_answer: bool = False) -> dict:
        """Convert game state to dictionary for serialization.
        
        Args:
            include_answer: Whether to include the answer
            
        Returns:
            Game state dictionary
        """
        result = {
            'game_id': self.game_id,
            'host': self.host,
            'players': self.players,
            'game_type': self.game_type,
            'status': self.status,
            'scores': self.scores,
            'settings': self.settings,
            'current_reader': self.current_reader,
            'buzzed_player': self.buzzed_player,
            'question_active': self.question_active,
            'riddles_asked': self.riddles_asked,
            'riddle_revealed': self.riddle_revealed
        }
        
        if self.current_riddle:
            result['current_riddle'] = {
                'riddle': self.current_riddle['riddle'],
                'difficulty': self.current_riddle.get('difficulty', 'medium'),
                'category': self.current_riddle.get('category', 'عام'),
                'riddle_number': self.riddles_asked
            }
            if include_answer or self.riddle_revealed:
                result['current_riddle']['answer'] = self.current_riddle['answer']
        
        return result
    
    @classmethod
    def from_dict(cls, game_id: str, data: dict) -> 'RiddlesGame':
        """Reconstruct a game from a dictionary.
        
        Args:
            game_id: Game identifier
            data: Game state dictionary
            
        Returns:
            RiddlesGame instance
        """
        game = cls(game_id, data['host'], data.get('settings'))
        game.players = data['players']
        game.status = data['status']
        game.scores = data['scores']
        game.current_reader = data.get('current_reader')
        game.buzzed_player = data.get('buzzed_player')
        game.question_active = data.get('question_active', False)
        game.riddles_asked = data.get('riddles_asked', 0)
        game.riddle_revealed = data.get('riddle_revealed', False)
        
        if 'current_riddle' in data and data['current_riddle']:
            game.current_riddle = data['current_riddle']
        
        return game
