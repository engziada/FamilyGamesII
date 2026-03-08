"""
Rapid Fire (الأسئلة السريعة) - Race to answer questions first.

Players see a question simultaneously. First player to buzz in gets
a chance to answer. Correct answer = points. Wrong answer = question
reopens for others to buzz.
"""
from datetime import datetime
import json
import random
from typing import Optional

from games.base import BaseGame
from services.data_service import get_data_service


class RapidFireGame(BaseGame):
    """Rapid Fire game: buzz-in trivia with race mechanics."""

    BUZZ_TIMEOUT_SECONDS = 10  # Time for buzzed player to answer

    def __init__(self, game_id: str, host: str, settings: Optional[dict] = None):
        super().__init__(game_id=game_id, host=host, game_type='rapid_fire', settings=settings or {
            'teams': False,
            'difficulty': 'all',
            'time_limit': 30,
        })

        # Question state
        self.current_question: Optional[dict] = None
        self.question_active = False
        self.buzzed_player: Optional[str] = None
        self.buzz_time: Optional[datetime] = None
        self.players_buzzed_wrong: set[str] = set()  # players who buzzed and answered wrong this round
        self.round_start_time: Optional[datetime] = None

        # Data service for questions (reuses trivia pool)
        self.data_service = get_data_service()
        self.data_service.prefetch_for_room(self.game_id, 'rapid_fire', count=30)

        # Legacy fallback
        self.questions: list[dict] = []
        self.question_index = 0

    # ── Player management ─────────────────────────────────────────────

    def add_player(self, player_name: str) -> None:
        super().add_player(player_name)

    def remove_player(self, player_name: str) -> None:
        """Remove a player; transfer host if needed."""
        super().remove_player(player_name)
        self.players_buzzed_wrong.discard(player_name)

        if player_name == self.buzzed_player:
            self.buzzed_player = None
            self.buzz_time = None

    # ── Game flow ─────────────────────────────────────────────────────

    def start_game(self) -> None:
        """Start the game and load first question."""
        if len(self.players) < 2:
            raise ValueError("عدد اللاعبين غير كافي")
        self.status = 'round_active'
        self._load_next_question()

    def _load_next_question(self) -> None:
        """Load the next question and reset round state."""
        self.current_question = self._get_question()
        self.question_active = True
        self.buzzed_player = None
        self.buzz_time = None
        self.players_buzzed_wrong = set()
        self.round_start_time = datetime.now()

    def next_question(self) -> None:
        """Advance to the next question."""
        self.status = 'round_active'
        self._load_next_question()

    # ── Buzz mechanics ────────────────────────────────────────────────

    def buzz(self, player_name: str) -> bool:
        """Register a player's buzz. Returns True if they got the buzz.

        Args:
            player_name: The player attempting to buzz in.

        Returns:
            True if buzz accepted, False if rejected.
        """
        if not self.question_active:
            return False
        if self.buzzed_player is not None:
            return False  # someone already buzzed
        if player_name in self.players_buzzed_wrong:
            return False  # already tried and failed this question

        self.buzzed_player = player_name
        self.buzz_time = datetime.now()
        self.status = 'buzzed'
        return True

    def submit_answer(self, player_name: str, answer_index: int) -> bool:
        """Submit an answer from the buzzed player.

        Args:
            player_name: Must be the buzzed player.
            answer_index: Index of the chosen option.

        Returns:
            True if correct, False if wrong.
        """
        if player_name != self.buzzed_player:
            return False
        if not self.question_active or not self.current_question:
            return False

        correct = answer_index == self.current_question.get('answer')

        if correct:
            self.question_active = False
            self._award_points(player_name)
            return True
        else:
            # Wrong answer: mark player, reopen for others
            self.players_buzzed_wrong.add(player_name)
            self.buzzed_player = None
            self.buzz_time = None
            self.status = 'round_active'

            # If all players have buzzed wrong, end the question
            active_player_names = {p['name'] for p in self.players}
            if self.players_buzzed_wrong >= active_player_names:
                self.question_active = False
                self.status = 'round_active'  # ready for next question

            return False

    def buzz_timeout(self) -> None:
        """Handle when buzzed player runs out of time to answer."""
        if self.buzzed_player:
            self.players_buzzed_wrong.add(self.buzzed_player)
            self.buzzed_player = None
            self.buzz_time = None
            self.status = 'round_active'

            # Check if all players exhausted
            active_player_names = {p['name'] for p in self.players}
            if self.players_buzzed_wrong >= active_player_names:
                self.question_active = False

    def question_timeout(self) -> None:
        """Handle when question time expires with no correct answer."""
        self.question_active = False
        self.buzzed_player = None
        self.buzz_time = None

    # ── Scoring ───────────────────────────────────────────────────────

    def _award_points(self, player_name: str, points: int = 10) -> None:
        """Award points to a player."""
        super().add_score(player_name, points)

    def add_score(self, player_name: str, points: int) -> None:
        """Public score setter (compatibility with app.py patterns)."""
        self._award_points(player_name, points)

    # ── Data ──────────────────────────────────────────────────────────

    def _get_question(self) -> Optional[dict]:
        """Fetch a question from the data service (rapid fire pool)."""
        question = self.data_service.get_item_for_room(self.game_id, 'rapid_fire')

        if question:
            correct_answer = question.get('correct_answer')
            wrong_answers = question.get('wrong_answers', [])
            options = wrong_answers.copy()
            answer_index = random.randint(0, len(options))
            options.insert(answer_index, correct_answer)

            return {
                'question': question.get('question'),
                'options': options,
                'answer': answer_index,
                'category': question.get('category'),
                'difficulty': question.get('difficulty'),
            }

        # Fallback: load from trivia JSON
        return self._get_fallback_question()

    def _get_fallback_question(self) -> Optional[dict]:
        """Fallback: load questions from trivia JSON file."""
        if not self.questions:
            try:
                with open('games/trivia/questions.json', 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.questions = data.get('questions', [])
                    random.shuffle(self.questions)
            except Exception:
                return None

        if not self.questions:
            return None

        q = self.questions[self.question_index]
        self.question_index = (self.question_index + 1) % len(self.questions)
        if self.question_index == 0:
            random.shuffle(self.questions)
        return q

    # ── Serialization ─────────────────────────────────────────────────

    def to_dict(self, include_answer: bool = False, **kwargs) -> dict:
        """Serialize game state for broadcasting.

        Args:
            include_answer: If True, include correct answer index.
        """
        q = None
        if self.current_question:
            q = self.current_question.copy()
            if not include_answer:
                q.pop('answer', None)

        state = self._build_base_state()
        state.update({
            'current_question': q,
            'buzzed_player': self.buzzed_player,
            'players_buzzed_wrong': list(self.players_buzzed_wrong),
            'question_active': self.question_active,
        })
        return state
