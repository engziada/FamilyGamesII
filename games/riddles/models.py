"""
Riddles (ألغاز) - Guess the answer to riddles.

Host reads a riddle aloud. Players type their answers. First correct answer
wins points. Hints can be revealed (reducing points). Game continues through
multiple riddles.
"""
import json
import random
from typing import Optional
from games.base import BaseGame
from services.data_service import get_data_service


class RiddlesGame(BaseGame):
    """Riddles game: guess the answer from clues."""

    HINT_COST = 2  # points deducted per hint used
    MAX_HINTS = 3

    def __init__(self, game_id: str, host: str, settings: Optional[dict] = None):
        super().__init__(game_id=game_id, host=host, game_type='riddles', settings=settings or {
            'teams': False,
            'difficulty': 'all',
            'time_limit': 60,
        })

        # Riddle state
        self.current_riddle: Optional[dict] = None
        self.riddle_active = False
        self.players_answered: set[str] = set()  # who already tried this riddle
        self.hints_revealed: int = 0
        self.round_number = 0
        self.data_service = get_data_service()
        self.data_service.prefetch_for_room(self.game_id, 'riddles', count=30)

        # Load riddle pool
        self.riddle_pool: list[dict] = self.data_service.get_items_for_room(self.game_id, 'riddles', count=30)
        self.used_riddles: set[int] = set()  # track used indices
        if not self.riddle_pool:
            self._load_riddles()

    # ── Player management ─────────────────────────────────────────────

    def add_player(self, player_name: str) -> None:
        super().add_player(player_name)

    def remove_player(self, player_name: str) -> None:
        """Remove a player; transfer host if needed."""
        super().remove_player(player_name)
        self.players_answered.discard(player_name)

    # ── Game flow ─────────────────────────────────────────────────────

    def start_game(self) -> None:
        """Start the game and load first riddle."""
        if len(self.players) < 2:
            raise ValueError("عدد اللاعبين غير كافي")
        self.status = 'round_active'
        self.round_number = 1
        self._load_next_riddle()

    def _load_next_riddle(self) -> None:
        """Load the next unused riddle."""
        available = [i for i in range(len(self.riddle_pool)) if i not in self.used_riddles]
        if not available:
            # All riddles used, reset
            self.used_riddles.clear()
            available = list(range(len(self.riddle_pool)))

        if not available:
            self.current_riddle = None
            return

        riddle_idx = random.choice(available)
        self.used_riddles.add(riddle_idx)
        self.current_riddle = self.riddle_pool[riddle_idx].copy()
        self.riddle_active = True
        self.players_answered = set()
        self.hints_revealed = 0

    def next_riddle(self) -> None:
        """Advance to the next riddle."""
        self.round_number += 1
        self._load_next_riddle()

    # ── Answer mechanics ──────────────────────────────────────────────

    def submit_answer(self, player_name: str, answer: str) -> dict:
        """Submit an answer to the current riddle.

        Returns:
            dict with 'correct', 'message', 'first_correct', 'points'
        """
        if not self.riddle_active or not self.current_riddle:
            return {'correct': False, 'message': 'لا يوجد لغز نشط'}
        if player_name in self.players_answered:
            return {'correct': False, 'message': 'لقد جاوبت بالفعل'}

        self.players_answered.add(player_name)

        # Check answer against accepted answers
        normalized_answer = self._normalize(answer)
        accepted = [self.current_riddle['answer']] + self.current_riddle.get('accepted_answers', [])

        for accepted_answer in accepted:
            if normalized_answer == self._normalize(accepted_answer):
                # Correct!
                points = self._calculate_points()
                self._award_points(player_name, points)
                self.riddle_active = False
                return {
                    'correct': True,
                    'message': f'{player_name} جاوب صح!',
                    'answer': self.current_riddle['answer'],
                    'points': points
                }

        return {'correct': False, 'message': 'إجابة خاطئة'}

    def _calculate_points(self) -> int:
        """Calculate points based on hints used."""
        base_points = 10
        return max(1, base_points - (self.hints_revealed * self.HINT_COST))

    def _award_points(self, player_name: str, points: int) -> None:
        """Award points to a player."""
        super().add_score(player_name, points)

    def add_score(self, player_name: str, points: int) -> None:
        """Public score setter (compatibility)."""
        self._award_points(player_name, points)

    # ── Hints ─────────────────────────────────────────────────────────

    def reveal_hint(self) -> Optional[str]:
        """Reveal the next hint. Returns the hint or None if no more hints."""
        if not self.riddle_active or not self.current_riddle:
            return None
        if self.hints_revealed >= min(self.MAX_HINTS, len(self.current_riddle.get('hints', []))):
            return None

        hint = self.current_riddle['hints'][self.hints_revealed]
        self.hints_revealed += 1
        return hint

    # ── Skip ───────────────────────────────────────────────────────────

    def skip_riddle(self) -> dict:
        """Skip the current riddle and reveal answer."""
        if not self.riddle_active or not self.current_riddle:
            return {'message': 'لا يوجد لغز نشط'}

        answer = self.current_riddle['answer']
        self.riddle_active = False
        return {
            'answer': answer,
            'message': f'الإجابة كانت: {answer}'
        }

    # ── Riddle timeout ─────────────────────────────────────────────────

    def riddle_timeout(self) -> dict:
        """Handle riddle time expiring."""
        if not self.riddle_active or not self.current_riddle:
            return {'message': 'لا يوجد لغز نشط'}

        answer = self.current_riddle['answer']
        self.riddle_active = False
        return {
            'answer': answer,
            'message': f'انتهى الوقت! الإجابة: {answer}'
        }

    # ── Data ───────────────────────────────────────────────────────────

    def _load_riddles(self) -> None:
        """Load riddle pool from JSON file."""
        try:
            with open('static/data/riddles.json', 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.riddle_pool = data.get('riddles', [])
                if self.settings.get('difficulty') != 'all':
                    self.riddle_pool = [
                        r for r in self.riddle_pool
                        if r.get('difficulty') == self.settings['difficulty']
                    ]
        except Exception:
            self.riddle_pool = []

    # ── Helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _normalize(text: str) -> str:
        """Normalize Arabic text for comparison."""
        if not text:
            return ''
        t = text.strip().lower()
        t = t.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
        t = t.replace('ة', 'ه').replace('ى', 'ي')
        t = t.replace('ؤ', 'و').replace('ئ', 'ي')
        import re
        t = re.sub(r'[\u064B-\u065F\u0670]', '', t)
        t = re.sub(r'[^\w\s]', '', t)  # remove punctuation
        return t

    # ── Serialization ─────────────────────────────────────────────────

    def to_dict(self, **kwargs) -> dict:
        """Serialize game state for broadcasting."""
        riddle_data = None
        if self.current_riddle:
            riddle_data = {
                'riddle': self.current_riddle['riddle'],
                'category': self.current_riddle.get('category', ''),
                'difficulty': self.current_riddle.get('difficulty', ''),
                'hints_revealed': self.hints_revealed,
                'hints': self.current_riddle.get('hints', [])[:self.hints_revealed],
            }
            # Only include answer if riddle is not active
            if not self.riddle_active:
                riddle_data['answer'] = self.current_riddle['answer']

        state = self._build_base_state()
        state.update({
            'current_riddle': riddle_data,
            'riddle_active': self.riddle_active,
            'round_number': self.round_number,
            'players_answered': list(self.players_answered),
        })
        return state
