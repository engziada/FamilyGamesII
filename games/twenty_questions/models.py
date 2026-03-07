"""
Twenty Questions (عشرون سؤال) - Guess the word in 20 yes/no questions.

One player (the thinker) picks a secret word. Other players ask yes/no
questions to narrow down the answer. After each question the thinker
answers yes/no/maybe. Players can attempt a final guess at any time.
Game ends when someone guesses correctly or 20 questions are exhausted.
"""
import json
import random
from typing import Optional
from games.base import BaseGame


class TwentyQuestionsGame(BaseGame):
    """Twenty Questions game: deduction through yes/no questions."""

    MAX_QUESTIONS = 20

    def __init__(self, game_id: str, host: str, settings: Optional[dict] = None):
        super().__init__(game_id=game_id, host=host, game_type='twenty_questions', settings=settings or {
            'teams': False,
            'time_limit': 60,
        })

        # Round state
        self.thinker: Optional[str] = None
        self.secret_word: Optional[str] = None
        self.secret_category: Optional[str] = None
        self.questions_asked: list[dict] = []  # [{player, question, answer}]
        self.question_count = 0
        self.current_asker: Optional[str] = None  # who is currently asking
        self.guesses_made: dict[str, list[str]] = {}  # {player: [guesses]}
        self.round_number = 0
        self.thinker_index = 0  # rotate thinker each round

        # Word pool
        self.word_pool: list[dict] = []
        self._load_word_pool()

    # ── Player management ─────────────────────────────────────────────

    def add_player(self, player_name: str) -> None:
        super().add_player(player_name)

    def remove_player(self, player_name: str) -> None:
        """Remove a player; transfer host if needed."""
        super().remove_player(player_name)
        self.guesses_made.pop(player_name, None)

        if player_name == self.thinker:
            # Thinker left — end round, no one wins
            self.status = 'ended'

    # ── Game flow ─────────────────────────────────────────────────────

    def start_game(self) -> None:
        """Start the game — first round begins with thinker selection."""
        if len(self.players) < 2:
            raise ValueError("عدد اللاعبين غير كافي")
        self.round_number = 1
        self._start_new_round()

    def _start_new_round(self) -> None:
        """Begin a new round with the next thinker."""
        self.thinker_index = self.thinker_index % len(self.players)
        self.thinker = self.players[self.thinker_index]['name']
        self.thinker_index += 1
        self.secret_word = None
        self.secret_category = None
        self.questions_asked = []
        self.question_count = 0
        self.current_asker = None
        self.guesses_made = {}
        self.status = 'thinking'  # thinker must set a word

    def next_round(self) -> None:
        """Advance to next round with new thinker."""
        self.round_number += 1
        self._start_new_round()

    # ── Secret word ───────────────────────────────────────────────────

    def set_secret(self, player_name: str, word: str, category: str = '') -> bool:
        """Thinker sets the secret word.

        Args:
            player_name: Must be the thinker.
            word: The secret word.
            category: Optional category hint.

        Returns:
            True if set successfully.
        """
        if player_name != self.thinker:
            return False
        if self.status != 'thinking':
            return False
        if not word or not word.strip():
            return False

        self.secret_word = word.strip()
        self.secret_category = category.strip() if category else ''
        self.status = 'asking'
        return True

    def get_random_word(self) -> dict:
        """Get a random word suggestion for the thinker."""
        if self.word_pool:
            return random.choice(self.word_pool)
        return {'word': 'قطة', 'category': 'حيوان'}

    # ── Question mechanics ────────────────────────────────────────────

    def ask_question(self, player_name: str, question: str) -> bool:
        """A player asks a yes/no question.

        Args:
            player_name: The player asking (cannot be the thinker).
            question: The question text.

        Returns:
            True if question accepted.
        """
        if self.status != 'asking':
            return False
        if player_name == self.thinker:
            return False
        if not question or not question.strip():
            return False
        if self.question_count >= self.MAX_QUESTIONS:
            return False

        self.questions_asked.append({
            'player': player_name,
            'question': question.strip(),
            'answer': None,  # thinker hasn't answered yet
        })
        self.question_count += 1
        self.current_asker = player_name
        return True

    def answer_question(self, player_name: str, answer: str) -> bool:
        """Thinker answers the latest question.

        Args:
            player_name: Must be the thinker.
            answer: 'yes', 'no', or 'maybe'.

        Returns:
            True if answer recorded.
        """
        if player_name != self.thinker:
            return False
        if self.status != 'asking':
            return False
        if not self.questions_asked:
            return False

        last_q = self.questions_asked[-1]
        if last_q['answer'] is not None:
            return False  # already answered

        if answer not in ('yes', 'no', 'maybe'):
            return False

        last_q['answer'] = answer

        # Check if max questions reached
        if self.question_count >= self.MAX_QUESTIONS:
            # All questions used up — thinker wins
            self._thinker_wins()

        return True

    # ── Guessing ──────────────────────────────────────────────────────

    def make_guess(self, player_name: str, guess: str) -> dict:
        """A player makes a final guess.

        Args:
            player_name: Cannot be the thinker.
            guess: The guessed word.

        Returns:
            dict with 'correct' boolean and details.
        """
        if self.status != 'asking':
            return {'correct': False, 'message': 'اللعبة غير نشطة'}
        if player_name == self.thinker:
            return {'correct': False, 'message': 'المفكر لا يمكنه التخمين'}
        if not guess or not guess.strip():
            return {'correct': False, 'message': 'التخمين فارغ'}

        guess = guess.strip()

        # Track guesses
        if player_name not in self.guesses_made:
            self.guesses_made[player_name] = []
        self.guesses_made[player_name].append(guess)

        # Check if correct (normalize Arabic)
        if self._normalize(guess) == self._normalize(self.secret_word):
            self._guesser_wins(player_name)
            return {
                'correct': True,
                'message': f'{player_name} خمن الكلمة صح!',
                'word': self.secret_word,
            }
        else:
            return {
                'correct': False,
                'message': f'تخمين خاطئ!',
                'guess': guess,
            }

    def forfeit_round(self) -> dict:
        """All guessers give up — thinker wins."""
        self._thinker_wins()
        return {
            'word': self.secret_word,
            'category': self.secret_category,
            'message': f'الإجابة كانت: {self.secret_word}',
        }

    # ── Scoring ───────────────────────────────────────────────────────

    def _guesser_wins(self, player_name: str) -> None:
        """Award points when a guesser wins."""
        # Points based on how few questions were asked
        remaining = self.MAX_QUESTIONS - self.question_count
        points = 10 + remaining  # 10-30 points
        self._award_points(player_name, points)
        self.status = 'ended'

    def _thinker_wins(self) -> None:
        """Award points when nobody guesses correctly."""
        self._award_points(self.thinker, 15)
        self.status = 'ended'

    def _award_points(self, player_name: str, points: int) -> None:
        """Award points to a player."""
        super().add_score(player_name, points)

    def add_score(self, player_name: str, points: int) -> None:
        """Public score setter (compatibility)."""
        self._award_points(player_name, points)

    # ── Data ──────────────────────────────────────────────────────────

    def _load_word_pool(self) -> None:
        """Load word pool from JSON file."""
        try:
            with open('static/data/twenty_questions_words.json', 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.word_pool = data.get('words', [])
        except Exception:
            self.word_pool = []

    # ── Helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _normalize(text: str) -> str:
        """Normalize Arabic text for comparison."""
        if not text:
            return ''
        t = text.strip().lower()
        t = t.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
        t = t.replace('ة', 'ه').replace('ى', 'ي')
        t = t.replace('ؤ', 'و').replace('ئ', 'ي')
        # Remove diacritics
        import re
        t = re.sub(r'[\u064B-\u065F\u0670]', '', t)
        return t

    # ── Serialization ─────────────────────────────────────────────────

    def to_dict(self, for_player: Optional[str] = None, **kwargs) -> dict:
        """Serialize game state for broadcasting.

        Args:
            for_player: If set, hides secret word from non-thinker players.
        """
        show_secret = (for_player == self.thinker) or (self.status == 'ended')

        state = self._build_base_state()
        state.update({
            'thinker': self.thinker,
            'secret_word': self.secret_word if show_secret else None,
            'secret_category': self.secret_category if (show_secret or self.status == 'asking') else None,
            'questions_asked': self.questions_asked,
            'question_count': self.question_count,
            'max_questions': self.MAX_QUESTIONS,
            'round_number': self.round_number,
        })
        return state
