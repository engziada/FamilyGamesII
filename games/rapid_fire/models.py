"""
Rapid Fire game models.
Players race to buzz in and answer questions first.
"""
from datetime import datetime
import random
from services.data_service import get_data_service


class RapidFireGame:
    """Rapid Fire game where players buzz in to answer questions.
    
    Game flow:
    1. Question is displayed to all players
    2. First player to buzz gets to answer
    3. If correct, they get points; if wrong, others can buzz
    4. Next question appears
    """
    
    # Buzz timeout in seconds (time to answer after buzzing)
    BUZZ_TIMEOUT = 10
    
    def __init__(self, game_id: str, host: str, settings: dict = None):
        """Initialize a Rapid Fire game.
        
        Args:
            game_id: Unique game identifier
            host: Name of the host player
            settings: Game settings dictionary
        """
        self.game_id = game_id
        self.host = host
        self.players = [{'name': host, 'isHost': True, 'team': 1}]
        self.game_type = 'rapid_fire'
        self.status = 'waiting'
        self.scores = {}
        self.team_scores = {'1': 0, '2': 0}
        
        # Game state
        self.current_question = None
        self.question_active = False  # Can players buzz?
        self.buzzed_player = None  # Who buzzed first
        self.players_answered = set()  # Players who already buzzed this round
        self.round_start_time = None
        self.buzz_time = None  # When the buzz happened
        
        # Settings
        self.settings = settings or {
            'teams': False,
            'difficulty': 'all',
            'time_limit': 30,  # Time per question
            'questions_per_game': 10
        }
        
        # Questions tracking
        self.questions_asked = 0
        self.current_question_index = 0
        
        # Get data service instance (reuses trivia questions)
        self.data_service = get_data_service()
        self.data_service.prefetch_for_room(self.game_id, 'trivia', count=30)
        
        # Test mode questions (for unit testing)
        self.test_questions = None
    
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
        
        # Assign to team with fewer players if teams mode is on
        team = 1
        if self.settings.get('teams'):
            t1 = len([p for p in self.players if p.get('team') == 1])
            t2 = len([p for p in self.players if p.get('team') == 2])
            team = 2 if t2 < t1 else 1
        
        self.players.append({'name': player_name, 'isHost': False, 'team': team})
    
    def remove_player(self, player_name: str) -> bool:
        """Remove a player from the game.
        
        Args:
            player_name: Name of the player to remove
            
        Returns:
            True if host was transferred, False otherwise
        """
        was_host = any(p['name'] == player_name and p.get('isHost', True) for p in self.players)
        was_buzzed = self.buzzed_player == player_name
        
        self.players = [p for p in self.players if p['name'] != player_name]
        
        if player_name in self.scores:
            del self.scores[player_name]
        if player_name in self.players_answered:
            self.players_answered.discard(player_name)
        
        # If buzzed player left, reset buzz state
        if was_buzzed:
            self.buzzed_player = None
            self.question_active = True
        
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
    
    def start_game(self) -> None:
        """Start the game.
        
        Raises:
            ValueError: If not enough players
        """
        if len(self.players) < 2:
            raise ValueError("عدد اللاعبين غير كافي")
        
        self.status = 'playing'
        self.questions_asked = 0
        self.next_question()
    
    def get_question(self) -> dict:
        """Get a question for the game.
        
        Returns:
            Question dictionary with question, options, and answer
        """
        # Use test questions if available (for unit testing)
        if self.test_questions:
            if self.current_question_index < len(self.test_questions):
                q = self.test_questions[self.current_question_index]
                self.current_question_index += 1
                return self._format_question(q)
            return None
        
        # Get from data service
        question = self.data_service.get_item_for_room(self.game_id, 'trivia')
        
        if question:
            return self._format_question(question)
        
        return None
    
    def _format_question(self, q: dict) -> dict:
        """Format a question for the game.
        
        Args:
            q: Raw question data
            
        Returns:
            Formatted question with shuffled options
        """
        correct_answer = q.get('correct_answer')
        wrong_answers = q.get('wrong_answers', [])
        
        # Create options array with correct answer at random position
        options = wrong_answers.copy()
        answer_index = random.randint(0, len(options))
        options.insert(answer_index, correct_answer)
        
        return {
            'question': q.get('question'),
            'options': options,
            'answer': answer_index,
            'answer_text': correct_answer,
            'category': q.get('category'),
            'difficulty': q.get('difficulty')
        }
    
    def next_question(self) -> dict:
        """Advance to the next question.
        
        Returns:
            The new question, or None if game ended
        """
        max_questions = self.settings.get('questions_per_game', 10)
        
        if self.questions_asked >= max_questions:
            self.status = 'ended'
            return None
        
        self.current_question = self.get_question()
        self.question_active = True
        self.buzzed_player = None
        self.players_answered = set()
        self.round_start_time = datetime.now()
        self.buzz_time = None
        self.questions_asked += 1
        
        return self.current_question
    
    def buzz(self, player_name: str) -> dict:
        """Player attempts to buzz in.
        
        Args:
            player_name: Name of the player buzzing
            
        Returns:
            dict with 'success' and 'message' keys
        """
        if self.status != 'playing':
            return {'success': False, 'message': 'اللعبة لم تبدأ بعد'}
        
        if not self.question_active:
            return {'success': False, 'message': 'لا يمكن الضغط الآن'}
        
        if player_name in self.players_answered:
            return {'success': False, 'message': 'لقد ضغطت بالفعل في هذه الجولة'}
        
        if self.buzzed_player:
            return {'success': False, 'message': f'{self.buzzed_player} ضغط أولاً!'}
        
        # Successful buzz
        self.buzzed_player = player_name
        self.players_answered.add(player_name)
        self.buzz_time = datetime.now()
        self.question_active = False  # Lock for others
        
        return {
            'success': True,
            'message': 'ضغطت أولاً! لديك 10 ثواني للإجابة',
            'time_limit': self.BUZZ_TIMEOUT
        }
    
    def submit_answer(self, player_name: str, answer_index: int) -> dict:
        """Submit an answer after buzzing.
        
        Args:
            player_name: Name of the player submitting
            answer_index: Index of the selected answer
            
        Returns:
            dict with 'correct', 'points', and 'message' keys
        """
        if self.buzzed_player != player_name:
            return {'correct': False, 'points': 0, 'message': 'لم تضغط أولاً!'}
        
        if not self.current_question:
            return {'correct': False, 'points': 0, 'message': 'لا يوجد سؤال حالي'}
        
        # Check if answer is correct
        is_correct = (answer_index == self.current_question['answer'])
        
        result = {
            'correct': is_correct,
            'correct_answer': self.current_question['answer_text']
        }
        
        if is_correct:
            # Calculate points based on time
            points = self._calculate_points()
            self.add_score(player_name, points)
            result['points'] = points
            result['message'] = f'إجابة صحيحة! حصلت على {points} نقاط'
        else:
            result['points'] = 0
            result['message'] = f'إجابة خاطئة! الإجابة الصحيحة: {self.current_question["answer_text"]}'
            # Unlock for other players to buzz
            self.question_active = True
            self.buzzed_player = None
        
        return result
    
    def _calculate_points(self) -> int:
        """Calculate points based on how quickly the answer was given.
        
        Returns:
            Points to award (10 for quick, 5 for slow)
        """
        if not self.buzz_time:
            return 5
        
        elapsed = (datetime.now() - self.buzz_time).total_seconds()
        
        if elapsed <= 3:
            return 10  # Quick answer
        elif elapsed <= self.BUZZ_TIMEOUT:
            return 5  # Slow answer
        return 0
    
    def buzz_timeout(self) -> dict:
        """Handle buzz timeout (player didn't answer in time).
        
        Returns:
            dict with 'message' and 'unlocked' keys
        """
        if not self.buzzed_player:
            return {'message': 'لا يوجد لاعب ضاغط', 'unlocked': False}
        
        player = self.buzzed_player
        self.buzzed_player = None
        self.question_active = True  # Unlock for others
        
        return {
            'message': f'{player} لم يجب في الوقت المحدد!',
            'unlocked': True,
            'correct_answer': self.current_question['answer_text'] if self.current_question else None
        }
    
    def skip_question(self) -> dict:
        """Skip the current question (host only).
        
        Returns:
            The next question or None if game ended
        """
        return self.next_question()
    
    def add_score(self, player_name: str, points: int) -> None:
        """Add points to a player's score.
        
        Args:
            player_name: Name of the player
            points: Points to add
        """
        if player_name not in self.scores:
            self.scores[player_name] = 0
        self.scores[player_name] += points
        
        # Update team score if teams mode
        if self.settings.get('teams'):
            player = next((p for p in self.players if p['name'] == player_name), None)
            if player:
                team_id = str(player['team'])
                self.team_scores[team_id] = self.team_scores.get(team_id, 0) + points
    
    def to_dict(self, include_answer: bool = False) -> dict:
        """Convert game state to dictionary for serialization.
        
        Args:
            include_answer: Whether to include the correct answer
            
        Returns:
            Game state dictionary
        """
        question_data = None
        if self.current_question:
            question_data = {
                'question': self.current_question['question'],
                'options': self.current_question['options'],
                'category': self.current_question.get('category')
            }
            if include_answer:
                question_data['answer'] = self.current_question['answer']
                question_data['answer_text'] = self.current_question['answer_text']
        
        return {
            'game_id': self.game_id,
            'host': self.host,
            'players': self.players,
            'game_type': self.game_type,
            'status': self.status,
            'scores': self.scores,
            'team_scores': self.team_scores,
            'settings': self.settings,
            'current_question': question_data,
            'question_active': self.question_active,
            'buzzed_player': self.buzzed_player,
            'questions_asked': self.questions_asked,
            'total_questions': self.settings.get('questions_per_game', 10)
        }
    
    @classmethod
    def from_dict(cls, game_id: str, data: dict) -> 'RapidFireGame':
        """Reconstruct a game from a dictionary.
        
        Args:
            game_id: Game identifier
            data: Game state dictionary
            
        Returns:
            RapidFireGame instance
        """
        game = cls(game_id, data['host'], data.get('settings'))
        game.players = data['players']
        game.status = data['status']
        game.scores = data['scores']
        game.team_scores = data.get('team_scores', {'1': 0, '2': 0})
        game.current_question = data.get('current_question')
        game.question_active = data.get('question_active', False)
        game.buzzed_player = data.get('buzzed_player')
        game.questions_asked = data.get('questions_asked', 0)
        return game
