"""
Riddles (ألغاز) - Guess the answer to riddles.

Host reads a riddle aloud. Players type their answers. First correct answer
wins points. Hints can be revealed (reducing points). Game continues through
multiple riddles.
"""
import json
import random
from typing import Optional


class RiddlesGame:
    """Riddles game: guess the answer from clues."""

    HINT_COST = 2  # points deducted per hint used
    MAX_HINTS = 3

    def __init__(self, game_id: str, host: str, settings: Optional[dict] = None):
        self.game_id = game_id
        self.host = host
        self.players: list[dict] = [{'name': host, 'isHost': True, 'team': 1}]
        self.game_type = 'riddles'
        self.status = 'waiting'  # waiting | round_active | ended
        self.scores: dict[str, int] = {}
        self.team_scores: dict[str, int] = {'1': 0, '2': 0}
        self.current_player = ''

        self.settings = settings or {
            'teams': False,
            'difficulty': 'all',
            'time_limit': 60,
        }

        # Riddle state
        self.current_riddle: Optional[dict] = None
        self.riddle_active = False
        self.players_answered: set[str] = set()  # who already tried this riddle
        self.hints_revealed: int = 0
        self.round_number = 0

        # Load riddle pool
        self.riddle_pool: list[dict] = []
        self.used_riddles: set[int] = set()  # track used indices
        self._load_riddles()

    # ── Player management ─────────────────────────────────────────────

    def add_player(self, player_name: str) -> None:
        """Add a player to the game lobby."""
        if len(self.players) >= 8:
            raise ValueError("غرفة اللعب ممتلئة")
        if any(p['name'] == player_name for p in self.players):
            raise ValueError("اللاعب موجود بالفعل")

        team = 1
        if self.settings.get('teams'):
            t1 = len([p for p in self.players if p.get('team') == 1])
            t2 = len([p for p in self.players if p.get('team') == 2])
            team = 2 if t2 < t1 else 1

        self.players.append({'name': player_name, 'isHost': False, 'team': team})

    def remove_player(self, player_name: str) -> None:
        """Remove a player; transfer host if needed."""
        self.players = [p for p in self.players if p['name'] != player_name]
        self.scores.pop(player_name, None)
        self.players_answered.discard(player_name)

        if player_name == self.host and self.players:
            self.host = self.players[0]['name']
            self.players[0]['isHost'] = True

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
        self.scores[player_name] = self.scores.get(player_name, 0) + points

        if self.settings.get('teams'):
            player = next((p for p in self.players if p['name'] == player_name), None)
            if player:
                team_id = str(player.get('team', 1))
                self.team_scores[team_id] = self.team_scores.get(team_id, 0) + points

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

        return {
            'game_id': self.game_id,
            'host': self.host,
            'players': self.players,
            'game_type': self.game_type,
            'status': self.status,
            'scores': self.scores,
            'team_scores': self.team_scores,
            'current_player': self.current_player,
            'settings': self.settings,
            'current_riddle': riddle_data,
            'riddle_active': self.riddle_active,
            'round_number': self.round_number,
            'players_answered': list(self.players_answered),
        }
