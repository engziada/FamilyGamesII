from datetime import datetime
import json
import random
from games.base import BaseGame
from services.data_service import get_data_service

class TriviaGame(BaseGame):
    def __init__(self, game_id, host, settings=None):
        super().__init__(game_id=game_id, host=host, game_type='trivia', settings=settings or {
            'teams': False,
            'difficulty': 'all',
            'time_limit': 30
        })
        self.current_player = '' # Trivia won't use this as much now
        self.current_question = None
        self.question_active = False
        self.round_start_time = None
        self.players_answered = set()  # Track who answered current question
        self.players_answered_wrong = set()  # Track who answered wrong

        # Get data service instance
        self.data_service = get_data_service()

        # Pre-fetch questions for this room (30 questions as per requirements)
        self.data_service.prefetch_for_room(self.game_id, 'trivia', count=30)

        # Legacy support - keep for backward compatibility
        self.questions = []
        self.question_index = 0

    def load_and_shuffle_questions(self):
        try:
            with open('games/trivia/questions.json', 'r', encoding='utf-8') as f:
                data = json.load(f)
                questions = data.get('questions', [])
                random.shuffle(questions)
                return questions
        except:
            return []

    def add_player(self, player_name):
        super().add_player(player_name)

    def remove_player(self, player_name):
        super().remove_player(player_name)

    def start_game(self):
        self.status = 'round_active' # Automatically start the round
        self.current_question = self.get_question()
        self.question_active = True
        self.round_start_time = datetime.now()
        self.players_answered = set()
        self.players_answered_wrong = set()

    def next_round(self):
        self.current_question = self.get_question()
        self.status = 'round_active'
        self.question_active = True
        self.round_start_time = datetime.now()
        self.players_answered = set()
        self.players_answered_wrong = set()

    def get_question(self):
        """Get a question using data service (prevents repetition)"""
        # Get question from data service
        question = self.data_service.get_item_for_room(self.game_id, 'trivia')

        if question:
            # Transform to match expected frontend format (options array + answer index)
            correct_answer = question.get('correct_answer')
            wrong_answers = question.get('wrong_answers', [])

            # Create options array with correct answer at random position
            options = wrong_answers.copy()
            answer_index = random.randint(0, len(options))
            options.insert(answer_index, correct_answer)

            return {
                'question': question.get('question'),
                'options': options,
                'answer': answer_index,
                'category': question.get('category'),
                'difficulty': question.get('difficulty')
            }

        # Fallback to legacy method if data service fails
        if not self.questions:
            self.questions = self.load_and_shuffle_questions()
        if not self.questions:
            return None

        q = self.questions[self.question_index]
        self.question_index = (self.question_index + 1) % len(self.questions)
        if self.question_index == 0:
            random.shuffle(self.questions)
        return q

    def get_random_question(self):
        return self.get_question()

    def add_score(self, player_name, points):
        super().add_score(player_name, points)

    def to_dict(self, include_answer=False):
        q = None
        if self.current_question:
            q = self.current_question.copy()
            if not include_answer:
                q.pop('answer', None)

        state = self._build_base_state()
        state.update({
            'current_question': q,
        })
        return state
