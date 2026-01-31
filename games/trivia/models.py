from datetime import datetime
import json
import random
from services.data_service import get_data_service

class TriviaGame:
    def __init__(self, game_id, host, settings=None, avatar='🐶'):
        self.game_id = game_id
        self.host = host
        self.players = [{'name': host, 'isHost': True, 'team': 1, 'avatar': avatar}]
        self.game_type = 'trivia'
        self.status = 'waiting'
        self.ready_players = set()
        self.scores = {}
        self.team_scores = {'1': 0, '2': 0}
        self.current_player = '' # Trivia won't use this as much now
        self.current_question = None
        self.question_active = False
        self.round_start_time = None
        self.players_answered = set()  # Track who answered current question
        self.players_answered_wrong = set()  # Track who answered wrong
        self.settings = settings or {
            'teams': False,
            'difficulty': 'all',
            'time_limit': 30
        }
        
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

    def add_player(self, player_name, avatar='🐶'):
        if len(self.players) >= 8:
            raise ValueError("الجمهور ممتلئ")
        if any(p['name'] == player_name for p in self.players):
            raise ValueError("الاسم مستخدم بالفعل")

        team = 1
        if self.settings.get('teams'):
            t1 = len([p for p in self.players if p.get('team') == 1])
            t2 = len([p for p in self.players if p.get('team') == 2])
            team = 2 if t2 < t1 else 1

        self.players.append({'name': player_name, 'isHost': False, 'team': team, 'avatar': avatar})

    def remove_player(self, player_name):
        self.players = [p for p in self.players if p['name'] != player_name]
        if player_name in self.scores: del self.scores[player_name]
        if player_name == self.host and self.players:
            self.host = self.players[0]['name']
            self.players[0]['isHost'] = True

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
        self.ready_players.clear()
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
        self.scores[player_name] = self.scores.get(player_name, 0) + points
        if self.settings.get('teams'):
            p = next((p for p in self.players if p['name'] == player_name), None)
            if p:
                team_id = str(p['team'])
                self.team_scores[team_id] = self.team_scores.get(team_id, 0) + points

    def to_dict(self, include_answer=False):
        q = None
        if self.current_question:
            q = self.current_question.copy()
            if not include_answer:
                q.pop('answer', None)

        return {
            'game_id': self.game_id,
            'host': self.host,
            'players': self.players,
            'game_type': self.game_type,
            'status': self.status,
            'ready_players': list(self.ready_players),
            'scores': self.scores,
            'team_scores': self.team_scores,
            'current_player': self.current_player,
            'current_question': q,
            'settings': self.settings
        }
