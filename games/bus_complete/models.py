from datetime import datetime
import random
from games.charades.models import CharadesGame

class BusCompleteGame(CharadesGame):
    def __init__(self, game_id, host, settings=None):
        super().__init__(game_id, host, settings)
        self.game_type = 'bus_complete'
        self.alphabet = "أ ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي".split()
        self.categories = ['اسم', 'حيوان', 'نبات', 'جماد', 'بلاد', 'أكلة', 'مهنة']
        self.current_letter = None
        self.player_submissions = {}  # {player_name: {category: answer}}
        self.round_scores = {} # {player_name: {category: points}}
        self.stopped_by = None

    def start_game(self):
        if len(self.players) < 2:
            raise ValueError("عدد اللاعبين غير كافي")
        self.next_round()

    def next_round(self, item=None):
        self.status = 'round_active'
        self.current_letter = random.choice(self.alphabet)
        self.player_submissions = {}
        self.round_scores = {}
        self.stopped_by = None
        self.round_start_time = datetime.now()

    def submit_answers(self, player_name, answers):
        if self.status != 'round_active':
            return False
        # Normalize answers (trim whitespace)
        self.player_submissions[player_name] = {k: v.strip() for k, v in answers.items()}
        return True

    def stop_bus(self, player_name):
        if self.status != 'round_active':
            return False
        self.status = 'scoring'
        self.stopped_by = player_name
        self.calculate_scores()
        return True

    def calculate_scores(self):
        # Initialize scores for this round
        self.round_scores = {p['name']: {cat: 0 for cat in self.categories} for p in self.players}

        for cat in self.categories:
            # Collect all answers for this category, normalized for comparison
            answers_map = {} # {normalized_answer: [player_names]}
            for p in self.players:
                pname = p['name']
                raw_ans = self.player_submissions.get(pname, {}).get(cat, '').strip()

                if not raw_ans:
                    continue

                # Normalization for comparison
                norm_ans = raw_ans.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
                norm_ans = norm_ans.replace('ة', 'ه').replace('ى', 'ي').replace('ئ', 'ي').replace('ؤ', 'و')

                # Check if it starts with the current letter (also normalized)
                norm_letter = self.current_letter.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')

                if norm_ans.startswith(norm_letter):
                    if norm_ans not in answers_map:
                        answers_map[norm_ans] = []
                    answers_map[norm_ans].append(pname)

            # Assign points
            for players in answers_map.values():
                points = 10 if len(players) == 1 else 5
                for pname in players:
                    self.round_scores[pname][cat] = points
                    self.add_score(pname, points)

    def add_score(self, player_name, points):
        if player_name not in self.scores:
            self.scores[player_name] = 0
        self.scores[player_name] += points

        if self.settings.get('teams'):
            p = next((p for p in self.players if p['name'] == player_name), None)
            if p:
                team_id = str(p['team'])
                if team_id not in self.team_scores:
                    self.team_scores[team_id] = 0
                self.team_scores[team_id] += points

    def to_dict(self, **kwargs):
        d = super().to_dict(**kwargs)
        d.update({
            'current_letter': self.current_letter,
            'categories': self.categories,
            'stopped_by': self.stopped_by
        })

        if self.status == 'scoring':
            d['player_submissions'] = self.player_submissions
            d['round_scores'] = self.round_scores
        else:
            d['submitted_players'] = list(self.player_submissions.keys())
            d.pop('current_item', None) # Not used in bus complete

        return d
