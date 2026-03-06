"""
Twenty Questions game models.
One player thinks of something, others ask yes/no questions to guess it.
"""
from datetime import datetime
import random
import json
import os
from services.data_service import get_data_service


class TwentyQuestionsGame:
    """Twenty Questions game where guessers ask yes/no questions.
    
    Game flow:
    1. Thinker picks a secret word (or gets random suggestion)
    2. Guessers ask yes/no/maybe questions
    3. After 20 questions, guessers must make final guess
    4. Correct guess = guessers win; Wrong = thinker wins
    """
    
    MAX_QUESTIONS = 20
    
    def __init__(self, game_id: str, host: str, settings: dict = None):
        """Initialize a Twenty Questions game.
        
        Args:
            game_id: Unique game identifier
            host: Name of the host player
            settings: Game settings dictionary
        """
        self.game_id = game_id
        self.host = host
        self.players = [{'name': host, 'isHost': True}]
        self.game_type = 'twenty_questions'
        self.status = 'waiting'
        self.scores = {}
        
        # Game state
        self.thinker = None  # Player who knows the secret
        self.secret_word = None
        self.secret_category = None
        self.questions_asked = []
        self.current_question = None
        self.question_count = 0
        self.game_phase = 'setup'  # setup, asking, guessing, ended
        
        # Settings
        self.settings = settings or {
            'thinker_mode': 'host',  # 'host' or 'rotate'
            'word_source': 'random',  # 'random' or 'thinker_chooses'
            'max_questions': 20
        }
        
        # Load words
        self.words = self._load_words()
        self.test_words = None  # For unit testing
        
        # Data service for word fetching
        self.data_service = get_data_service()
    
    def _load_words(self) -> list:
        """Load words from JSON file.
        
        Returns:
            List of word objects
        """
        words_path = os.path.join('static', 'data', 'twenty_questions_words.json')
        try:
            with open(words_path, 'r', encoding='utf-8') as f:
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
        """Start the game and assign thinker.
        
        Returns:
            dict with game setup info
            
        Raises:
            ValueError: If not enough players
        """
        if len(self.players) < 2:
            raise ValueError("عدد اللاعبين غير كافي")
        
        self.status = 'playing'
        self.game_phase = 'setup'
        self.question_count = 0
        self.questions_asked = []
        
        # Assign thinker (host by default, or random)
        if self.settings.get('thinker_mode') == 'host':
            self.thinker = self.host
        else:
            self.thinker = random.choice(self.players)['name']
        
        return {
            'thinker': self.thinker,
            'phase': self.game_phase,
            'word_source': self.settings.get('word_source')
        }
    
    def get_random_word_suggestion(self) -> dict:
        """Get a random word suggestion for the thinker.
        
        Returns:
            dict with word and category, or None if no words available
        """
        # Use test words if available
        if self.test_words:
            word = random.choice(self.test_words)
            return {'word': word['word'], 'category': word['category']}
        
        if not self.words:
            return None
        
        word = random.choice(self.words)
        return {'word': word['word'], 'category': word['category']}
    
    def set_secret_word(self, word: str, category: str = None) -> dict:
        """Set the secret word (thinker only).
        
        Args:
            word: The secret word
            category: Optional category hint
            
        Returns:
            dict with success status
        """
        self.secret_word = word
        self.secret_category = category
        self.game_phase = 'asking'
        
        return {
            'success': True,
            'phase': self.game_phase,
            'category_hint': category
        }
    
    def ask_question(self, player_name: str, question: str) -> dict:
        """Ask a question about the secret word.
        
        Args:
            player_name: Name of the player asking
            question: The yes/no question
            
        Returns:
            dict with question status
        """
        if self.game_phase != 'asking':
            return {'success': False, 'message': 'ليس وقت السؤال'}
        
        if player_name == self.thinker:
            return {'success': False, 'message': 'المفكر لا يسأل!'}
        
        if self.question_count >= self.MAX_QUESTIONS:
            return {'success': False, 'message': 'انتهت الأسئلة العشرون!'}
        
        self.current_question = {
            'question': question,
            'asker': player_name,
            'answer': None,
            'timestamp': datetime.now().isoformat()
        }
        
        return {
            'success': True,
            'question': question,
            'asker': player_name,
            'question_number': self.question_count + 1
        }
    
    def answer_question(self, answer: str) -> dict:
        """Answer the current question (thinker only).
        
        Args:
            answer: 'yes', 'no', or 'maybe'
            
        Returns:
            dict with answer status
        """
        if not self.current_question:
            return {'success': False, 'message': 'لا يوجد سؤال حالي'}
        
        if answer not in ['yes', 'no', 'maybe']:
            return {'success': False, 'message': 'إجابة غير صحيحة'}
        
        self.current_question['answer'] = answer
        self.questions_asked.append(self.current_question)
        self.question_count += 1
        
        result = {
            'success': True,
            'answer': answer,
            'question_count': self.question_count,
            'questions_remaining': self.MAX_QUESTIONS - self.question_count
        }
        
        # Check if max questions reached
        if self.question_count >= self.MAX_QUESTIONS:
            self.game_phase = 'guessing'
            result['phase'] = 'guessing'
            result['message'] = 'انتهت الأسئلة! حان وقت التخمين النهائي'
        
        self.current_question = None
        return result
    
    def make_guess(self, player_name: str, guess: str) -> dict:
        """Make a final guess of the secret word.
        
        Args:
            player_name: Name of the player guessing
            guess: The guessed word
            
        Returns:
            dict with guess result
        """
        if player_name == self.thinker:
            return {'success': False, 'message': 'المفكر لا يخمن!'}
        
        if self.game_phase not in ['asking', 'guessing']:
            return {'success': False, 'message': 'ليس وقت التخمين'}
        
        # Check if guess is correct (case-insensitive)
        is_correct = guess.strip().lower() == self.secret_word.strip().lower()
        
        if is_correct:
            self.status = 'ended'
            self.game_phase = 'ended'
            # Award points to guesser
            points = self._calculate_guess_points()
            self.add_score(player_name, points)
            
            return {
                'success': True,
                'correct': True,
                'secret_word': self.secret_word,
                'winner': player_name,
                'points': points,
                'message': f'🎉 صحيح! الكلمة كانت: {self.secret_word}'
            }
        else:
            # Wrong guess - game continues or ends
            if self.game_phase == 'guessing':
                # Final guess was wrong - thinker wins
                self.status = 'ended'
                self.game_phase = 'ended'
                self.add_score(self.thinker, 10)
                
                return {
                    'success': True,
                    'correct': False,
                    'secret_word': self.secret_word,
                    'winner': self.thinker,
                    'message': f'❌ خطأ! الكلمة كانت: {self.secret_word}'
                }
            else:
                # Wrong guess during asking phase - continue
                return {
                    'success': True,
                    'correct': False,
                    'message': 'تخمين خاطئ! استمروا في السؤال',
                    'continue': True
                }
    
    def _calculate_guess_points(self) -> int:
        """Calculate points for correct guess based on questions used.
        
        Returns:
            Points to award (more points for fewer questions)
        """
        # Base points: 20 - questions asked
        return max(5, self.MAX_QUESTIONS - self.question_count)
    
    def forfeit(self, player_name: str) -> dict:
        """Give up and reveal the answer.
        
        Args:
            player_name: Name of the player forfeiting
            
        Returns:
            dict with forfeit result
        """
        if player_name == self.thinker:
            return {'success': False, 'message': 'المفكر لا يستسلم!'}
        
        self.status = 'ended'
        self.game_phase = 'ended'
        
        # Thinker gets points
        self.add_score(self.thinker, 10)
        
        return {
            'success': True,
            'secret_word': self.secret_word,
            'category': self.secret_category,
            'message': f'استسلمتم! الكلمة كانت: {self.secret_word}'
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
    
    def to_dict(self, include_secret: bool = False) -> dict:
        """Convert game state to dictionary for serialization.
        
        Args:
            include_secret: Whether to include the secret word
            
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
            'thinker': self.thinker,
            'game_phase': self.game_phase,
            'question_count': self.question_count,
            'questions_asked': self.questions_asked,
            'questions_remaining': self.MAX_QUESTIONS - self.question_count,
            'current_question': self.current_question
        }
        
        if include_secret:
            result['secret_word'] = self.secret_word
            result['secret_category'] = self.secret_category
        else:
            result['category_hint'] = self.secret_category  # Show category as hint
        
        return result
    
    @classmethod
    def from_dict(cls, game_id: str, data: dict) -> 'TwentyQuestionsGame':
        """Reconstruct a game from a dictionary.
        
        Args:
            game_id: Game identifier
            data: Game state dictionary
            
        Returns:
            TwentyQuestionsGame instance
        """
        game = cls(game_id, data['host'], data.get('settings'))
        game.players = data['players']
        game.status = data['status']
        game.scores = data['scores']
        game.thinker = data.get('thinker')
        game.secret_word = data.get('secret_word')
        game.secret_category = data.get('secret_category')
        game.game_phase = data.get('game_phase', 'setup')
        game.question_count = data.get('question_count', 0)
        game.questions_asked = data.get('questions_asked', [])
        game.current_question = data.get('current_question')
        return game
