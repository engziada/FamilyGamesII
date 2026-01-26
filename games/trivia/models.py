from datetime import datetime
import json
import random

class TriviaGame:
    def __init__(self, game_id, host, settings=None):
        self.game_id = game_id
        self.host = host
        self.players = [{'name': host, 'isHost': True, 'team': 1}]
        self.game_type = 'trivia'
        self.status = 'waiting'
        self.scores = {}
        self.team_scores = {'1': 0, '2': 0}
        self.current_player = ''
        self.current_question = None
        self.round_start_time = None
        self.settings = settings or {
            'teams': False,
            'difficulty': 'all',
            'time_limit': 30
        }
        self.questions = self.load_and_shuffle_questions()
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
        if len(self.players) >= 8:
            raise ValueError("الغرفة ممتلئة")
        if any(p['name'] == player_name for p in self.players):
            raise ValueError("اللاعب موجود بالفعل")

        team = 1
        if self.settings.get('teams'):
            t1 = len([p for p in self.players if p.get('team') == 1])
            t2 = len([p for p in self.players if p.get('team') == 2])
            team = 2 if t2 < t1 else 1

        self.players.append({'name': player_name, 'isHost': False, 'team': team})

    def remove_player(self, player_name):
        self.players = [p for p in self.players if p['name'] != player_name]
        if player_name in self.scores: del self.scores[player_name]
        if player_name == self.host and self.players:
            self.host = self.players[0]['name']
            self.players[0]['isHost'] = True

    def start_game(self):
        self.status = 'playing'
        self.current_player = self.players[0]['name']

    def next_round(self):
        current_idx = next((i for i, p in enumerate(self.players) if p['name'] == self.current_player), 0)
        next_idx = (current_idx + 1) % len(self.players)
        self.current_player = self.players[next_idx]['name']
        self.current_question = self.get_question()
        self.round_start_time = None

    def get_question(self):
        if not self.questions:
            self.questions = self.load_and_shuffle_questions()
        if not self.questions: return None

        q = self.questions[self.question_index]
        self.question_index = (self.question_index + 1) % len(self.questions)
        if self.question_index == 0: random.shuffle(self.questions)
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
            'scores': self.scores,
            'team_scores': self.team_scores,
            'current_player': self.current_player,
            'current_question': q,
            'settings': self.settings
        }
